// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal view of a SuperRare Liquid Edition ERC-20, mirroring the
/// surface documented in the liquid-editions-starter-kit (verified July 2026).
/// The real interface is `ILiquid is IERC20Metadata`; we only need burn + the
/// reads the ballot/renderer use. Pull the full interface from the starter kit
/// when you deploy: github.com/superrare/liquid-editions-starter-kit
interface ILiquid is IERC20 {
    /// @notice Burn `amount` of the caller's tokens. The game's only sink.
    function burn(uint256 amount) external;

    /// @notice The cap. Burn progress is derived as maxTotalSupply - totalSupply().
    function maxTotalSupply() external view returns (uint256);

    /// @notice (rarePerToken, tokenPerRare, sqrtPriceX96, currentTick, liquidity, currentSupply)
    /// Order VERIFIED against the live Sepolia deploy (2026-07-24) three ways: the
    /// starter kit's quoteBuy(rareIn)→liquidOut semantics, and raw tick math
    /// (1.0001^-27780 ≈ 0.0622 UR3030-per-RARE with RARE as token0) both agree
    /// word0 = rarePerToken (≈16.08 on the test market). Do not swap these.
    function getMarketState()
        external
        view
        returns (uint256, uint256, uint160, int24, uint128, uint256);
}
