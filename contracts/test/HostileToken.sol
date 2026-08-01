// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/* Test-only. A "token" whose `balanceOf` REVERTS.
 *
 * ⚑ This exists to prove one property of UR3030Lens721: pointing `setEdition` at something
 *   broken must NOT be able to take the metadata of all 100 cards offline. `tierOfHolder` is
 *   called from `tokenURI`, so an uncaught revert there would mean one bad owner transaction
 *   breaks the artwork everywhere at once — on a marketplace, and permanently as far as any
 *   cache is concerned. A mock that can only succeed cannot test that.
 */
contract HostileToken {
    function balanceOf(address) external pure returns (uint256) {
        revert("no");
    }
}
