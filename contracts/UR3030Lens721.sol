// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IEditionRenderer {
    function tokenURI() external view returns (string memory);
}

/**
 *  upperdeckripmaster3030 — the LENS collection.
 *
 *  Every card in the 100-card deck is a lens: a render keyed by card id. This contract is
 *  both the ERC-721 that owns the hero 1/1s and the renderer that answers for every id in
 *  the deck, minted or not.
 *
 *  ── The two tokenURIs, and why there are two ──────────────────────────────────────────
 *      tokenURI()          the EDITION's own display. Delegated to the passthrough renderer
 *                          (contracts/UR3030RenderPrototype.sol), which already draws the
 *                          live market/burn card. SuperRare calls this one.
 *      tokenURI(uint256)   PER-CARD metadata for ids 1…100.
 *
 *  ── Renders without a mint, on purpose ────────────────────────────────────────────────
 *  Field cards 34…100 are render-only at launch: readable, linkable, real, with nothing
 *  minted. So tokenURI(id) must NOT require ownership — OpenZeppelin's default reverts on a
 *  nonexistent token and that is exactly wrong here. Minting later only attaches ownership;
 *  it never changes what the card *is*.
 *
 *  ── What actually holds the art ───────────────────────────────────────────────────────
 *  `image` is ipfs://CID — the pinned gif/png, the permanent record. `animation_url` is the
 *  live HTML lens, wrapped on-chain in a data:text/html document because SuperRare's media
 *  slot renders animation_url as a document rather than fetching an external URL. If the
 *  site is gone the lens is gone and the image is still there. THE CARDS PERSIST.
 *
 *  ── Minting ───────────────────────────────────────────────────────────────────────────
 *  33 heroes: 11 gacha pack-claims + 22 earned Season-1 game titles. Both arrive the same
 *  way — an EIP-712 voucher signed by the claim authority — because the qualifying event
 *  (a pack rip, a tournament win) is observed off-chain either way, and one trust path is
 *  easier to reason about than two. Cards 34…100 cannot be minted here at all.
 *
 *  ⚠ NO EXTERNAL AUDIT (artist's call). This contract is deliberately small, uses OZ for
 *    everything load-bearing, hand-rolls no token accounting, and takes no custody of funds.
 *
 *  NFA. Experimental art token — it can go to zero.
 */
contract UR3030Lens721 is ERC721, EIP712 {
    using Strings for uint256;

    // ── deck geometry (model v2.2: 33 heroes + 67 field = 100) ──
    uint256 public constant DECK = 100;
    uint256 public constant HERO_MAX = 33;
    /// Lovebeing lives far above the deck so it can never collide with a card id.
    uint256 public constant LOVEBEING_BASE = 1_000_000;

    struct Card {
        string cid;    // IPFS CID of the base art — the permanent record
        string title;  // the artist's title, verbatim
    }

    address public owner;
    /// Signs mint vouchers. Separate from `owner` so the hot signing key is not the admin key.
    address public claimSigner;
    /// The edition's passthrough renderer; tokenURI() delegates here.
    address public editionRenderer;

    string public collectionName;
    string public collectionDescription;
    string public externalUrl;      // e.g. https://upperdeckripmaster3030.com
    string public lensBaseUrl;      // e.g. https://upperdeckripmaster3030.com/cards/hero/

    mapping(uint256 => Card) private _cards;
    mapping(bytes32 => bool) public voucherUsed;
    mapping(address => uint256) public lovebeingOf;   // wallet => its Lovebeing id (0 = none)
    uint256 public lovebeingMinted;

    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address to,uint256 id,uint8 kind,uint256 deadline)");

    event CardSet(uint256 indexed id, string cid, string title);
    event HeroClaimed(uint256 indexed id, address indexed to, uint8 kind);
    event LovebeingMinted(address indexed to, uint256 indexed id);

    error NotOwner();
    error BadId();
    error NotHero();
    error AlreadyMinted();
    error VoucherExpired();
    error VoucherSpent();
    error BadSignature();
    error Soulbound();
    error OnePerWallet();
    error NoRenderer();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address editionRenderer_,
        address claimSigner_,
        string memory externalUrl_,
        string memory lensBaseUrl_
    ) ERC721(name_, symbol_) EIP712("upperdeckripmaster3030", "1") {
        owner = msg.sender;
        editionRenderer = editionRenderer_;
        claimSigner = claimSigner_;
        externalUrl = externalUrl_;
        lensBaseUrl = lensBaseUrl_;
        collectionName = name_;
    }

    // ── admin ────────────────────────────────────────────────────────────────────────────
    function transferOwnership(address to) external onlyOwner { owner = to; }
    function setClaimSigner(address s) external onlyOwner { claimSigner = s; }
    function setEditionRenderer(address r) external onlyOwner { editionRenderer = r; }
    function setUrls(string calldata external_, string calldata lensBase_) external onlyOwner {
        externalUrl = external_;
        lensBaseUrl = lensBase_;
    }
    function setDescription(string calldata d) external onlyOwner { collectionDescription = d; }

    /// Register card art. Batched because 100 individual transactions is a bad launch night.
    function setCards(uint256[] calldata ids, string[] calldata cids, string[] calldata titles)
        external
        onlyOwner
    {
        require(ids.length == cids.length && ids.length == titles.length, "length");
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            if (id == 0 || id > DECK) revert BadId();
            _cards[id] = Card(cids[i], titles[i]);
            emit CardSet(id, cids[i], titles[i]);
        }
    }

    function card(uint256 id) external view returns (string memory cid, string memory title) {
        Card storage c = _cards[id];
        return (c.cid, c.title);
    }

    // ── minting ──────────────────────────────────────────────────────────────────────────
    /**
     * Claim a hero with a signed voucher. `kind` is 1 = gacha pack-claim, 2 = earned game
     * title; it is bound into the signature so a pack voucher can't be replayed as a title.
     *
     * Effects land BEFORE _safeMint, because _safeMint calls into the receiver and a
     * receiver that re-enters must find the id already taken.
     */
    function claimHero(address to, uint256 id, uint8 kind, uint256 deadline, bytes calldata sig)
        external
    {
        if (id == 0 || id > HERO_MAX) revert NotHero();
        if (block.timestamp > deadline) revert VoucherExpired();
        if (_ownerOf(id) != address(0)) revert AlreadyMinted();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, to, id, kind, deadline))
        );
        if (voucherUsed[digest]) revert VoucherSpent();
        address signer = ECDSA.recover(digest, sig);
        if (signer == address(0) || signer != claimSigner) revert BadSignature();

        voucherUsed[digest] = true;
        emit HeroClaimed(id, to, kind);
        _safeMint(to, id);
    }

    /**
     * Lovebeing — one per wallet, non-transferable, non-burnable. It is the wallet's mark,
     * not a collectible, which is why it is soulbound and why it is issued rather than sold.
     */
    function mintLovebeing(address to) external onlyOwner returns (uint256 id) {
        if (lovebeingOf[to] != 0) revert OnePerWallet();
        id = LOVEBEING_BASE + (++lovebeingMinted);
        lovebeingOf[to] = id;
        emit LovebeingMinted(to, id);
        _safeMint(to, id);
    }

    function isLovebeing(uint256 id) public pure returns (bool) {
        return id > LOVEBEING_BASE;
    }

    /// Soulbound enforcement. Mint (from == 0) is allowed; transfer and burn are not.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (isLovebeing(tokenId) && from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    // ── rendering ────────────────────────────────────────────────────────────────────────
    /// The EDITION's display — delegated to the passthrough renderer.
    function tokenURI() external view returns (string memory) {
        if (editionRenderer == address(0)) revert NoRenderer();
        return IEditionRenderer(editionRenderer).tokenURI();
    }

    /**
     * Per-card metadata. Deliberately does NOT require the token to exist: field cards
     * 34…100 are render-only at launch and must still resolve.
     */
    function tokenURI(uint256 id) public view override returns (string memory) {
        if (isLovebeing(id)) return _lovebeingJson(id);
        if (id == 0 || id > DECK) revert BadId();

        Card storage c = _cards[id];
        bool hero = id <= HERO_MAX;
        string memory idStr = id.toString();

        string memory head = string(
            abi.encodePacked(
                '{"name":"', _escJson(bytes(c.title).length == 0 ? string(abi.encodePacked("Card ", idStr)) : c.title),
                unicode' · №', idStr,
                '","description":"', _escJson(collectionDescription),
                '","external_url":"', _escJson(externalUrl), "/cards/", idStr, '"'
            )
        );

        string memory media = "";
        if (bytes(c.cid).length != 0) {
            media = string(abi.encodePacked(',"image":"ipfs://', c.cid, '"'));
        }
        if (hero && bytes(lensBaseUrl).length != 0) {
            media = string(
                abi.encodePacked(
                    media,
                    ',"animation_url":"',
                    _animHtml(string(abi.encodePacked(lensBaseUrl, idStr, ".html"))),
                    '"'
                )
            );
        }

        string memory attrs = string(
            abi.encodePacked(
                ',"attributes":[',
                '{"trait_type":"Deck","value":"Season I"},',
                '{"trait_type":"Class","value":"', hero ? "Hero 1/1" : "Field Lens", '"},',
                '{"trait_type":"Card","value":', idStr, "},",
                '{"trait_type":"Minted","value":"', _ownerOf(id) == address(0) ? "no" : "yes", '"}]}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(string(abi.encodePacked(head, media, attrs))))
            )
        );
    }

    function _lovebeingJson(uint256 id) internal view returns (string memory) {
        string memory json = string(
            abi.encodePacked(
                '{"name":"Lovebeing","description":"',
                _escJson(collectionDescription),
                '","external_url":"', _escJson(externalUrl),
                '","attributes":[{"trait_type":"Class","value":"Holder-bound"},',
                '{"trait_type":"Transferable","value":"no"},',
                '{"trait_type":"Serial","value":', (id - LOVEBEING_BASE).toString(), "}]}"
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    /**
     * SuperRare's media slot renders animation_url as a *data:text/html* document, not as an
     * external URL it will fetch. So the live lens has to be handed over as a tiny on-chain
     * page that frames it, with a visible escape hatch if the marketplace sandbox refuses
     * the frame. Same approach as the passthrough renderer.
     */
    function _animHtml(string memory url) internal pure returns (string memory) {
        bytes memory html = abi.encodePacked(
            "<!doctype html><meta charset=utf-8>",
            '<meta name=viewport content="width=device-width,initial-scale=1">',
            "<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;",
            "font:12px monospace;color:#2bff80}body{display:flex;flex-direction:column}",
            ".b{flex:none;padding:6px;text-align:center}.b a{color:#ffd23b}",
            "iframe{flex:1 1 auto;border:0;width:100%;display:block}</style>",
            '<div class=b>upperdeckripmaster3030 &#183; <a href="', url,
            '" target=_blank rel=noopener>open the card &#8599;</a></div>',
            '<iframe src="', url, '" allow="accelerometer;gyroscope;autoplay"></iframe>'
        );
        return string(abi.encodePacked("data:text/html;base64,", Base64.encode(html)));
    }

    /// Minimal JSON string escaping — a stray quote in a title would otherwise break metadata.
    function _escJson(string memory in_) internal pure returns (string memory) {
        bytes memory b = bytes(in_);
        bytes memory out = new bytes(b.length * 2);
        uint256 j;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 ch = b[i];
            if (ch == '"' || ch == "\\") {
                out[j++] = "\\";
                out[j++] = ch;
            } else if (ch == 0x0a) {
                out[j++] = "\\";
                out[j++] = "n";
            } else if (uint8(ch) < 0x20) {
                out[j++] = " ";
            } else {
                out[j++] = ch;
            }
        }
        assembly { mstore(out, j) }
        return string(out);
    }
}
