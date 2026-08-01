// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * TEST ONLY — a stand-in for the SuperRare Liquid Edition.
 *
 * Exists so the render path can be proven end-to-end without a live edition:
 *
 *     MockLiquid  →  Ripmaster3030Renderer  →  Ripmaster3030Lens721.tokenURI()
 *
 * The lens delegates its no-arg tokenURI() to the passthrough renderer, and the renderer
 * reads live market state off the edition. Until all three are wired together that
 * delegation is only ever exercised against address(0), which proves nothing. This closes
 * that gap on a local EVM, before anyone spends gas on Sepolia.
 *
 * Values default to the real shape of a Liquid Edition at launch: the whole supply minted
 * into the pool, so totalSupply == maxTotalSupply until tokens burn, and burns permanent.
 *
 * NOT FOR DEPLOYMENT.
 */
contract MockLiquid {
    string public symbol = "3030";
    uint256 public maxTotalSupply = 3_030_000 ether;

    uint256 private _rarePerToken = 1 ether;
    uint256 private _tokenPerRare = 0.062 ether;   // the uncalibrated Sepolia curve
    int24 private _tick = -13_500;
    uint256 private _currentSupply = 3_030_000 ether;

    /// Burn tokens out of the live supply, exactly as a real pack rip would.
    function burnFromSupply(uint256 amountWei) external {
        _currentSupply = _currentSupply > amountWei ? _currentSupply - amountWei : 0;
    }

    function setTick(int24 t) external { _tick = t; }
    function setTokenPerRare(uint256 v) external { _tokenPerRare = v; }

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
        )
    {
        return (_rarePerToken, _tokenPerRare, uint160(1 << 96), _tick, uint128(1e18), _currentSupply);
    }
}
