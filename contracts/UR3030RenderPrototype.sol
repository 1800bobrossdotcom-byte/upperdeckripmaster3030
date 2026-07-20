// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// Minimal view of the SuperRare Liquid Edition this renderer reads from.
interface ILiquid {
    function symbol() external view returns (string memory);
    function maxTotalSupply() external view returns (uint256);
    function getMarketState()
        external
        view
        returns (
            uint256 rarePerToken,
            uint256 tokenPerRare,
            uint160 sqrtPriceX96,
            int24 currentTick,
            uint128 liquidity,
            uint256 currentSupply
        );
}

/// @title upperdeckripmaster3030 — render prototype
/// @notice PROTOTYPE renderer for the $UR3030 Liquid Edition. Proves the
///         mechanism: the token's tokenURI() delegates here, and this reads
///         LIVE market state (supply, price, tick) off the token to draw a
///         dynamic "market card" on-chain. The visual is a deliberate
///         placeholder — the final art is swapped in later by pointing the
///         token at a fresh render contract (setRenderContract is re-callable).
/// @dev    Owner can retarget name/description/external_url without a redeploy,
///         so copy can iterate freely on testnet.
contract UR3030RenderPrototype {
    using Strings for uint256;

    struct Snap {
        uint256 supplyWhole;
        uint256 maxWhole;
        uint256 perRareWhole;
        uint256 pct;
        int24 tick;
        string sym;
    }

    address public immutable LIQUID;
    address public owner;
    string public lensName;
    string public lensDescription;
    string public externalUrl;

    constructor(
        address liquid,
        string memory name_,
        string memory description_,
        string memory externalUrl_
    ) {
        LIQUID = liquid;
        owner = msg.sender;
        lensName = name_;
        lensDescription = description_;
        externalUrl = externalUrl_;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setMeta(
        string calldata name_,
        string calldata description_,
        string calldata externalUrl_
    ) external onlyOwner {
        lensName = name_;
        lensDescription = description_;
        externalUrl = externalUrl_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice The Liquid Edition delegates its tokenURI() to this function.
    function tokenURI() external view returns (string memory) {
        Snap memory s = _snap();
        string memory image = string(
            abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(_svg(s))))
        );
        string memory json = _json(s, image);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _snap() internal view returns (Snap memory s) {
        ILiquid liq = ILiquid(LIQUID);
        (, uint256 tokenPerRare, , int24 tick, , uint256 currentSupply) = liq.getMarketState();
        uint256 maxWhole = liq.maxTotalSupply() / 1e18;
        s.sym = liq.symbol();
        s.supplyWhole = currentSupply / 1e18;
        s.maxWhole = maxWhole;
        s.perRareWhole = tokenPerRare / 1e18;
        s.pct = maxWhole == 0 ? 0 : (s.supplyWhole * 100) / maxWhole;
        if (s.pct > 100) s.pct = 100;
        s.tick = tick;
    }

    function _json(Snap memory s, string memory image) internal view returns (string memory) {
        string memory head = string(
            abi.encodePacked(
                '{"name":"', lensName,
                '","description":"', lensDescription,
                '","external_url":"', externalUrl,
                '","image":"', image,
                '","attributes":['
            )
        );
        string memory attrs = string(
            abi.encodePacked(
                '{"trait_type":"Circulating Supply","value":', s.supplyWhole.toString(), "},",
                '{"trait_type":"Max Supply","value":', s.maxWhole.toString(), "},",
                '{"trait_type":"UR3030 per RARE","value":', s.perRareWhole.toString(), "},",
                '{"trait_type":"Supply Filled %","value":', s.pct.toString(), "},",
                '{"trait_type":"Market Tick","value":"', _tickStr(s.tick), '"}]}'
            )
        );
        return string(abi.encodePacked(head, attrs));
    }

    // ── on-chain SVG "market card" (placeholder art) ──
    function _svg(Snap memory s) internal pure returns (string memory) {
        uint256 hue = _hue(s.tick);
        string memory defs = string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" viewBox="0 0 600 840">',
                '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
                '<stop offset="0" stop-color="hsl(', hue.toString(), ',90%,55%)"/>',
                '<stop offset="1" stop-color="hsl(', ((hue + 80) % 360).toString(), ',90%,45%)"/>',
                "</linearGradient></defs>"
            )
        );
        string memory head = string(
            abi.encodePacked(
                '<rect width="600" height="840" fill="#04120a"/>',
                '<rect x="18" y="18" width="564" height="804" rx="22" fill="none" stroke="url(#g)" stroke-width="6"/>',
                '<text x="300" y="118" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" fill="url(#g)">UPPERDECK</text>',
                '<text x="300" y="172" text-anchor="middle" font-family="Arial Black,Arial" font-size="44" fill="url(#g)">RIPMASTER 3030</text>',
                '<text x="300" y="224" text-anchor="middle" font-family="monospace" font-size="21" fill="#8fffc4">$', s.sym, " &#183; LIQUID EDITION</text>"
            )
        );
        return string(abi.encodePacked(defs, head, _body(s)));
    }

    function _body(Snap memory s) internal pure returns (string memory) {
        uint256 barW = (520 * s.pct) / 100;
        string memory meter = string(
            abi.encodePacked(
                '<g font-family="monospace" fill="#d9ffe9">',
                '<text x="40" y="358" font-size="20">CIRCULATING</text>',
                '<text x="560" y="358" text-anchor="end" font-size="20">', s.supplyWhole.toString(), " / ", s.maxWhole.toString(), "</text>",
                '<rect x="40" y="378" width="520" height="26" rx="13" fill="#0a2a1a"/>',
                '<rect x="40" y="378" width="', barW.toString(), '" height="26" rx="13" fill="#2bff80"/>',
                '<text x="300" y="397" text-anchor="middle" font-size="15" fill="#04120a">', s.pct.toString(), '% FILLED</text>'
            )
        );
        string memory stats = string(
            abi.encodePacked(
                '<text x="40" y="468" font-size="20">1 RARE &#8594;</text>',
                '<text x="560" y="468" text-anchor="end" font-size="20">', s.perRareWhole.toString(), ' $UR</text>',
                '<text x="40" y="518" font-size="20">MARKET TICK</text>',
                '<text x="560" y="518" text-anchor="end" font-size="20">', _tickStr(s.tick), "</text>",
                "</g>",
                '<text x="300" y="782" text-anchor="middle" font-family="monospace" font-size="14" fill="#5fcf8f">the market is the medium &#183; art is a live prototype</text>',
                "</svg>"
            )
        );
        return string(abi.encodePacked(meter, stats));
    }

    function _hue(int24 tick) internal pure returns (uint256) {
        int256 t = int256(tick);
        if (t < 0) t = -t;
        return uint256(t) % 360;
    }

    function _tickStr(int24 v) internal pure returns (string memory) {
        if (v < 0) {
            return string(abi.encodePacked("-", uint256(uint24(-v)).toString()));
        }
        return uint256(uint24(v)).toString();
    }
}
