// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Build note: compile with viaIR + optimizer (string-heavy on-chain SVG).
// foundry: `via_ir = true` in [profile.default]; hardhat: `viaIR: true`.

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

/// @title ripmaster3030studios — render prototype
/// @notice PROTOTYPE renderer for the $3030 Liquid Edition. Proves the
///         mechanism: the token's tokenURI() delegates here, and this reads
///         LIVE market state (supply, price, tick) off the token to draw a
///         dynamic "market card" on-chain. The visual is a deliberate
///         placeholder — the final art is swapped in later by pointing the
///         token at a fresh render contract (setRenderContract is re-callable).
/// @dev    Owner can retarget name/description/external_url without a redeploy,
///         so copy can iterate freely on testnet.
contract Ripmaster3030Renderer {
    using Strings for uint256;

    struct Snap {
        uint256 supplyWhole;   // live totalSupply, whole tokens
        uint256 maxWhole;      // maxTotalSupply, whole tokens
        uint256 burnedWhole;   // permanently burned = max − live (mint-once, burns never re-mint)
        uint256 burnedFrac;    // …and its two decimals. A pack burns 62.5, so halves are REAL here
        uint256 pctBps;        // burned fraction of the mint, in basis points (0..10000)
        uint256 perRareInt;    // integer part of $3030 per RARE
        uint256 perRareFrac;   // two-decimal fraction of $3030 per RARE
        int24 tick;
        string sym;
    }

    address public immutable LIQUID;
    address public owner;
    string public lensName;
    string public lensDescription;
    string public externalUrl;
    // When set, emitted as ERC-721-metadata "animation_url" — marketplaces
    // (SuperRare included) render it as a live iframe in the token page's media
    // slot, so the SITE ITSELF becomes the edition's display.
    // ⛔ POINT THIS AT /superrare.html, NOT AT THE SITE ROOT. index.html loads pack.js
    //    and js/wallet.js; framing it inside a marketplace puts wallet code in their
    //    iframe, which is exactly what SuperRare's security team flagged on
    //    cabinet.html and precisely why the wallet-free superrare.html exists.
    //    The Sepolia renderer was set to the site root and nobody noticed.
    // ⚠ cabinet.html is NOT the fallback for that reason — it performs WalletConnect
    //    burns. superrare.html is the embeddable one; npm run test:embed guards it.
    string public animationUrl;

    constructor(
        address liquid,
        string memory name_,
        string memory description_,
        string memory externalUrl_,
        string memory animationUrl_
    ) {
        LIQUID = liquid;
        owner = msg.sender;
        lensName = name_;
        lensDescription = description_;
        externalUrl = externalUrl_;
        animationUrl = animationUrl_;
    }

    function setAnimationUrl(string calldata animationUrl_) external onlyOwner {
        animationUrl = animationUrl_;
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
        uint256 maxSupply = liq.maxTotalSupply();                 // wei, 18-dec
        s.sym = liq.symbol();
        s.tick = tick;
        s.supplyWhole = currentSupply / 1e18;
        s.maxWhole = maxSupply / 1e18;

        // A Liquid Edition mints its whole supply into the pool at launch, so
        // totalSupply ≈ maxTotalSupply until tokens are burned — and burns are
        // PERMANENT (mint-once). The meaningful, non-confusing stat is therefore
        // BURNED progress, derived as maxTotalSupply − totalSupply (there is no
        // burn getter; see docs/RESEARCH-NOTES.md). Computed in wei, mul-before-div.
        uint256 burnedWei = maxSupply > currentSupply ? maxSupply - currentSupply : 0;
        s.burnedWhole = burnedWei / 1e18;
        /* ⛔ A PACK BURNS 62.5 TOKENS, SO THE HALF IS NOT ROUNDING NOISE — IT IS A PACK.
         *   `burnedWei / 1e18` printed 312 for a true 312.5, i.e. 4.99 packs where five had been
         *   ripped, on the token's own page. Two decimals, mul-before-div, same shape as
         *   perRareCenti twenty lines down. */
        s.burnedFrac = (burnedWei % 1e18) * 100 / 1e18;
        s.pctBps = maxSupply == 0 ? 0 : (burnedWei * 10_000) / maxSupply;   // 0..10000

        // tokenPerRare ($3030 per RARE) is word1 — order verified on the live
        // Sepolia deploy via quoteBuy(rareIn)→liquidOut + tick math (see
        // interfaces/ILiquid.sol). 18-dec fixed point, often <1 (0.062 on the
        // uncalibrated test market), so `/1e18` truncates to 0: scale ×100
        // BEFORE dividing and render two decimals (never div-before-mul).
        uint256 perRareCenti = (tokenPerRare * 100) / 1e18;
        s.perRareInt = perRareCenti / 100;
        s.perRareFrac = perRareCenti % 100;
    }

    // "0.07" / "1.50" from split integer + two-decimal fraction
    function _dec2(uint256 whole_, uint256 frac_) internal pure returns (string memory) {
        return string(abi.encodePacked(whole_.toString(), ".", frac_ < 10 ? "0" : "", frac_.toString()));
    }

    // escape a double-quote / backslash so owner-set strings can't corrupt the JSON
    function _escJson(string memory in_) internal pure returns (string memory) {
        bytes memory b = bytes(in_);
        bytes memory o = new bytes(b.length * 2);
        uint256 j;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") { o[j++] = "\\"; }
            o[j++] = c;
        }
        assembly { mstore(o, j) }
        return string(o);
    }

    // escape &, <, > so a symbol can't break the SVG/XML
    function _escXml(string memory in_) internal pure returns (string memory) {
        bytes memory b = bytes(in_);
        bytes memory o = new bytes(b.length * 5);
        uint256 j;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == "&") { o[j++]="&"; o[j++]="a"; o[j++]="m"; o[j++]="p"; o[j++]=";"; }
            else if (c == "<") { o[j++]="&"; o[j++]="l"; o[j++]="t"; o[j++]=";"; }
            else if (c == ">") { o[j++]="&"; o[j++]="g"; o[j++]="t"; o[j++]=";"; }
            else { o[j++] = c; }
        }
        assembly { mstore(o, j) }
        return string(o);
    }

    // SuperRare's Liquid Editions media slot renders the render contract's on-chain
    // metadata, and (per their LiquidLensHTMLExample) animation_url as a *data:text/html*
    // document — NOT an external https URL. So we wrap the owner-set URL in a tiny
    // on-chain HTML page that frames the live arcade full-bleed, with an always-visible
    // "open the full arcade ↗" link bar as the fallback if the marketplace sandbox
    // blocks the external frame.
    function _animHtml(string memory url) internal pure returns (string memory) {
        bytes memory html = abi.encodePacked(
            "<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\">",
            // flex column so the iframe fills EXACTLY the space under the link bar — no magic
            // pixel math, no overflow, so there's a single scrollbar (the site's), not two.
            "<style>html,body{margin:0;height:100%;overflow:hidden;background:#02120a;font:12px monospace;color:#2bff80}",
            "body{display:flex;flex-direction:column}.b{flex:none;padding:6px;text-align:center}.b a{color:#ffd23b}",
            "iframe{flex:1 1 auto;border:0;width:100%;display:block}</style>",
            "<div class=b>ripmaster3030studios &#183; <a href=\"", url, "\" target=_blank rel=noopener>open the full arcade &#8599;</a></div>",
            "<iframe src=\"", url, "\" allow=\"accelerometer;gyroscope;autoplay\"></iframe>"
        );
        return string(abi.encodePacked("data:text/html;base64,", Base64.encode(html)));
    }

    function _json(Snap memory s, string memory image) internal view returns (string memory) {
        string memory anim = bytes(animationUrl).length == 0
            ? ""
            : string(abi.encodePacked('"animation_url":"', _animHtml(animationUrl), '",'));
        string memory head = string(
            abi.encodePacked(
                '{"name":"', _escJson(lensName),
                '","description":"', _escJson(lensDescription),
                '","external_url":"', _escJson(externalUrl),
                '",', anim,
                '"image":"', image,
                '","attributes":['
            )
        );
        string memory attrs = string(
            abi.encodePacked(
                '{"trait_type":"Burned","value":', _dec2(s.burnedWhole, s.burnedFrac), "},",
                '{"trait_type":"Live Supply","value":', s.supplyWhole.toString(), "},",
                '{"trait_type":"Max Supply","value":', s.maxWhole.toString(), "},",
                '{"trait_type":"3030 per RARE","value":"', _dec2(s.perRareInt, s.perRareFrac), '"},',
                /* ⛔ `pctBps / 100` IS AN INTEGER DIVIDE AND IT PUBLISHED A LIE. pctBps was 1 —
                 *   one basis point, entirely correct — and 1/100 truncates to 0, so the live
                 *   token page read "Burned % 0" while 312.5 had permanently burned. That is the
                 *   single number the deflation claim rests on, saying nothing had happened, on
                 *   the flagship surface. ⚑ It only shows up BELOW 1%, which is exactly where a
                 *   launch spends its first weeks, and it would have healed itself later — the
                 *   worst kind, because by the time anyone could notice it would be gone. */
                '{"trait_type":"Burned %","value":', _dec2(s.pctBps / 100, s.pctBps % 100), "},",
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
                // ONE WORD, lowercase, always — artist's law. textLength force-fits
                // the full word to the card face so no renderer ever wraps it.
                '<text x="300" y="150" text-anchor="middle" font-family="Arial Black,Arial" font-size="38" textLength="540" lengthAdjust="spacingAndGlyphs" fill="url(#g)">ripmaster3030studios</text>',
                '<text x="300" y="224" text-anchor="middle" font-family="monospace" font-size="21" fill="#8fffc4">$', _escXml(s.sym), " &#183; LIQUID EDITION</text>"
            )
        );
        return string(abi.encodePacked(defs, head, _body(s)));
    }

    function _body(Snap memory s) internal pure returns (string memory) {
        uint256 barW = (520 * s.pctBps) / 10_000;   // burned fraction of the bar (bps preserves sub-percent)
        string memory meter = string(
            abi.encodePacked(
                '<g font-family="monospace" fill="#d9ffe9">',
                '<text x="40" y="358" font-size="20">BURNED</text>',
                '<text x="560" y="358" text-anchor="end" font-size="20">', _dec2(s.burnedWhole, s.burnedFrac), " / ", s.maxWhole.toString(), "</text>",
                '<rect x="40" y="378" width="520" height="26" rx="13" fill="#0a2a1a"/>',
                '<rect x="40" y="378" width="', barW.toString(), '" height="26" rx="13" fill="#ff5a3c"/>',
                '<text x="300" y="397" text-anchor="middle" font-size="15" fill="#04120a">', (s.pctBps / 100).toString(), '% BURNED</text>'
            )
        );
        string memory stats = string(
            abi.encodePacked(
                '<text x="40" y="468" font-size="20">1 RARE &#8594;</text>',
                '<text x="560" y="468" text-anchor="end" font-size="20">', _dec2(s.perRareInt, s.perRareFrac), ' $UR</text>',
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
        // widen to int256 BEFORE negating so v == type(int24).min can't panic
        if (v < 0) {
            return string(abi.encodePacked("-", uint256(-int256(v)).toString()));
        }
        return uint256(int256(v)).toString();
    }
}
