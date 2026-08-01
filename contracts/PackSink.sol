// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/* ripmaster3030studios — PackSink: takes a pack payment and splits it ATOMICALLY.
 *
 * Half of every pack burns permanently; half funds the studio. See docs/TREASURY.md.
 *
 * ⚑ WHY THIS CONTRACT EXISTS AT ALL — it is the whole point, so it is stated first.
 *   The obvious implementation is two calls from the browser: burn half, transfer half. That is
 *   TWO user-signed transactions, and a wallet can sign one and reject the other. Both outcomes
 *   are real damage:
 *       burn ok, transfer rejected  -> collector's tokens destroyed, studio unpaid, no pack owed
 *       transfer ok, burn rejected  -> studio paid, nothing burned, the deflation claim is false
 *   No ordering fixes it, because there is no atomicity between two signatures. One call that
 *   either wholly succeeds or wholly reverts is the only correct shape, and that call has to live
 *   in a contract.
 *
 * ⚑ THE SAFETY ARGUMENT IS "SMALL ENOUGH TO READ IN ONE SITTING", because there is no external
 *   audit (artist's call — CLAUDE.md). So, deliberately:
 *     · no owner, no admin, no upgrade path, no pause
 *     · both addresses are `immutable` — fixed at deploy, unchangeable, cheap to read
 *     · holds NO balance between calls; every token that enters leaves in the same transaction
 *     · the only privileged thing in here is nothing
 *   Anything that would need trusting the deployer later has been left out on purpose.
 *
 * ⚠ THE TOKEN IS FIXED AT DEPLOY and cannot be repointed. That is intentional: a settable token
 *   address on a contract that burns things is a rug switch. Deploy a new sink if the token
 *   changes.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function burn(uint256 amount) external;              // OZ ERC20Burnable — selector 0x42966c68
}

contract PackSink {
    IERC20  public immutable token;
    address public immutable treasury;

    /// Basis points of each pack that BURN. 5000 = 50.00%.
    uint16 public constant BURN_BPS = 5000;

    event PackPaid(address indexed buyer, uint256 amount, uint256 burned, uint256 toTreasury);
    event RakePaid(address indexed player, uint256 amount, uint256 burned, uint256 toTreasury);
    event Flushed(uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();

    constructor(address token_, address treasury_) {
        if (token_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        treasury = treasury_;
    }

    /* Pay for a pack. Caller must `approve` this contract for `amount` first. */
    function buyPack(uint256 amount) external {
        (uint256 burned, uint256 toTreasury) = _split(amount);
        emit PackPaid(msg.sender, amount, burned, toTreasury);
    }

    /* Pay a game rake. Same split, different event.
     *
     * ⚑ ONE CONTRACT SERVES BOTH BECAUSE THE RATIO IS THE SAME. The game rake is 10% of the pot,
     *   of which 5% burns and 5% funds the studio — i.e. exactly half of the rake, which is what
     *   this contract does. `js/wager-payout.js` computes those halves; before this existed the
     *   browser burned the WHOLE rake, so the treasury half was arithmetic that never happened.
     *
     * ⚑ SEPARATE EVENT, NOT A SEPARATE CONTRACT. Pack revenue and game revenue are different
     *   lines in the same ledger, and an indexer summing `PackPaid` must not silently count
     *   rakes. Deploying a second sink to get a second event would double the surface to review
     *   for no gain — the split logic is identical and is written once, below.
     */
    function payRake(uint256 amount) external {
        (uint256 burned, uint256 toTreasury) = _split(amount);
        emit RakePaid(msg.sender, amount, burned, toTreasury);
    }

    /* The split itself — pull in, burn half, pay the remainder out, hold nothing.
     *
     * ⚑ THE TREASURY SHARE IS `amount - burned`, NOT a second percentage. Two independent
     *   percentages leave rounding dust behind on odd amounts — one wei at a time, permanently
     *   stuck in a contract with no owner to sweep it. Subtracting makes the split exhaustive by
     *   construction: burned + toTreasury == amount, for every input, with no dust and no
     *   possibility of paying out more than came in.
     *
     * ⚠ Return values ARE checked. Plenty of ERC-20s return `false` instead of reverting, and an
     *   unchecked transfer here would mean a payment marked settled that never moved anything.
     */
    function _split(uint256 amount) internal returns (uint256 burned, uint256 toTreasury) {
        if (amount == 0) revert ZeroAmount();

        if (!token.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();

        burned = (amount * BURN_BPS) / 10_000;
        toTreasury = amount - burned;

        if (burned != 0) token.burn(burned);
        if (toTreasury != 0 && !token.transfer(treasury, toTreasury)) revert TransferFailed();
    }

    /* Anyone may sweep a stray balance to the treasury.
     *
     * ⚑ PERMISSIONLESS ON PURPOSE. `buyPack` never leaves a balance, so this only ever matters
     *   when someone `transfer`s straight to the contract by mistake — which, with no owner and
     *   no sweep, would strand those tokens forever. The destination is `immutable`, so opening
     *   this to everyone grants no power: the caller cannot choose where it goes and gains
     *   nothing by calling it. An owner-gated sweep would have added an admin key to a contract
     *   whose main safety property is not having one.
     */
    function flush() external {
        uint256 bal = token.balanceOf(address(this));
        if (bal == 0) revert ZeroAmount();
        if (!token.transfer(treasury, bal)) revert TransferFailed();
        emit Flushed(bal);
    }
}
