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

/// Just the one call the tier system needs from the $3030 edition.
interface IERC20Balance {
    function balanceOf(address who) external view returns (uint256);
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

    /* ── STAKING = THE LENS READS YOUR BALANCE ────────────────────────────────────────────────
     * SuperRare's own docs name the inputs a Liquid Lens may use: "token price, trading activity,
     * and HOLDER BALANCES", and the Cohort-01 CLI guide repeats it — render contracts "can read
     * price, supply, liquidity, burn progress, balances". That last input IS the staking
     * mechanism here: no staking contract, no emissions, no lock, nothing to drain.
     *
     * ⚑ THE ART ACKNOWLEDGES YOU; IT DOES NOT PAY YOU. That is the anti-casino ethos expressed
     *   as a mechanic — the tangible prize is the having-done-it. Tiers are purely aesthetic, so
     *   the two obvious objections do not apply: a balance is borrowable for a snapshot, which
     *   would matter if it gated value and does not when it gates a colour; and there is no
     *   yield, so there is nothing to farm.
     *
     * ⚠ OWNER-DEPENDENT METADATA IS NOT CACHEABLE and marketplaces cache tokenURI hard. The tier
     *   is therefore advertised as an attribute AND exposed as `tierOf()` so the live page can
     *   read it directly, which is the path that updates immediately. Updates are pull-based —
     *   SuperRare: "a render contract is not a background process… the market changes on-chain,
     *   metadata gets refetched, and the artwork changes."
     */
    address public edition;                 // the $3030 ERC-20; address(0) = tiers off
    /// Ascending balance thresholds in the token's own BASE UNITS. tierAt[0] is tier 1's floor.
    uint256[4] public tierAt;

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
    event EditionSet(address indexed edition);
    event TiersSet(uint256[4] thresholds);
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
    error TiersNotAscending();

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

        /* Default ladder, anchored on the PACK rather than on round numbers: a launch pack is
         * ~350 $3030, so the tiers are one pack, ten, a hundred, a thousand. That makes the
         * answer to "what do I need to hold?" sayable in the project's own unit of account.
         * ⚠ Assumes the edition's 18 decimals; `setTiers` exists to correct that if it differs.
         * The constructor signature is deliberately UNCHANGED — scripts/lens-cli.mjs and
         * docs/DEPLOY-LENS.md both depend on renderer being 3rd and signer 4th. */
        tierAt = [uint256(350 ether), 3_500 ether, 35_000 ether, 350_000 ether];
    }

    // ── admin ────────────────────────────────────────────────────────────────────────────
    function transferOwnership(address to) external onlyOwner { owner = to; }
    function setClaimSigner(address s) external onlyOwner { claimSigner = s; }
    function setEditionRenderer(address r) external onlyOwner { editionRenderer = r; }
    /// Point the tier system at the $3030 ERC-20. address(0) turns tiers off (everyone is tier 0).
    function setEdition(address e) external onlyOwner { edition = e; emit EditionSet(e); }
    /// Ascending thresholds in the token's base units.
    function setTiers(uint256[4] calldata t) external onlyOwner {
        // ⚠ ascending is not cosmetic: `tierOfHolder` walks the array and returns the highest
        //   threshold cleared, so an out-of-order table would silently cap everyone at tier 1.
        for (uint256 i = 1; i < 4; i++) if (t[i] <= t[i - 1]) revert TiersNotAscending();
        tierAt = t;
        emit TiersSet(t);
    }
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

    // ── tiers: the render reads the holder's balance ──────────────────────────────────────
    /**
     * Which tier a wallet's `$3030` balance puts it in: 0 (none) … 4.
     *
     * ⚠ THIS MUST NEVER REVERT, AND THAT IS THE WHOLE DESIGN OF IT. It is called from
     *   `tokenURI`, so if a misconfigured `edition` address — a non-token, a self-destructed
     *   contract, an EOA, a token that reverts on `balanceOf` — could throw, then one bad
     *   `setEdition` would take the metadata of all 100 cards offline at once, on a marketplace,
     *   permanently as far as any cache is concerned. The `try` swallows it and the card renders
     *   at tier 0, which is exactly how it looks before the edition is ever set. A cosmetic
     *   feature is not allowed to be able to break the artwork.
     */
    function tierOfHolder(address who) public view returns (uint8) {
        if (edition == address(0) || who == address(0)) return 0;
        /* ⚠ THE `code.length` CHECK IS LOAD-BEARING — `try/catch` DOES NOT COVER IT.
         *   Solidity emits a contract-existence (extcodesize) check before an external call that
         *   returns data, and a failure there is NOT catchable by try/catch. So without this
         *   line, setting `edition` to an address with no code — e.g. pasting a WALLET address
         *   instead of the token's, which is the single most likely mistake anyone will make
         *   here — reverts `tokenURI` for all 100 cards. Found by the test below, not by
         *   reasoning: the try/catch looked sufficient and wasn't. */
        if (edition.code.length == 0) return 0;
        try IERC20Balance(edition).balanceOf(who) returns (uint256 bal) {
            uint8 t = 0;
            for (uint256 i = 0; i < 4; i++) if (bal >= tierAt[i]) t = uint8(i + 1);
            return t;
        } catch {
            return 0;
        }
    }

    /// The tier a CARD currently renders at — i.e. its owner's. Unminted cards are tier 0.
    function tierOf(uint256 id) public view returns (uint8) {
        return tierOfHolder(_ownerOf(id));
    }

    /* The ladder is anchored on the pack (~350 $3030), so a holder can say what they hold in
     * packs rather than in round numbers. Fire, because the token burns so the art can live —
     * the torches on the landing page are the same idea. */
    function tierName(uint8 t) public pure returns (string memory) {
        if (t == 0) return "Ash";
        if (t == 1) return "Spark";
        if (t == 2) return "Ember";
        if (t == 3) return "Flame";
        return "Inferno";
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

        /* ⚠ "Deck: Season I" used to be baked in here. Seasons were removed (artist directive,
         *   2026-08-01 — the pack schedule is TIERED, not a calendar), and this string would have
         *   gone on-chain in the metadata of all 100 cards. Caught before deploy. */
        uint8 tier = tierOf(id);
        string memory attrs = string(
            abi.encodePacked(
                ',"attributes":[',
                '{"trait_type":"Deck","value":"Genesis"},',
                '{"trait_type":"Class","value":"', hero ? "Hero 1/1" : "Field Lens", '"},',
                '{"trait_type":"Card","value":', idStr, "},",
                '{"trait_type":"Holding","value":"', tierName(tier), '"},',
                '{"trait_type":"Tier","value":', uint256(tier).toString(), "},",
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
