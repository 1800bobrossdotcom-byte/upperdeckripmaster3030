// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILiquid} from "./interfaces/ILiquid.sol";

/// @title SeasonBallot — burn-to-vote for upperdeckripmaster3030
/// @notice Each season, holders burn the Liquid Edition token to vote candidate
/// cards into that season's pack. Burns are permanent and deflationary — voting
/// is the game's sink. The render contract and the site read `tally()` to make
/// the leading cards glow, and `winners()` after the close block seeds the
/// season's ERC-721 Companion Lens Collection.
///
/// Design notes in docs/MECHANICS.md §3 and docs/BATTLE.md. Deploy to Sepolia
/// first (docs/TESTNET.md) — this custody-free contract still wants a review
/// before mainnet.
contract SeasonBallot {
    ILiquid public immutable token;
    address public curator;

    struct Season {
        uint64 closeBlock;
        bool open;
        uint32[] cardIds;                       // candidate pool for the season
        mapping(uint32 => uint256) tally;       // cardId => burned votes
        uint256 totalBurned;
    }

    mapping(uint32 => Season) private seasons;   // seasonId => Season

    event SeasonOpened(uint32 indexed seasonId, uint32[] cardIds, uint64 closeBlock);
    event Voted(uint32 indexed seasonId, uint32 indexed cardId, address indexed voter, uint256 amount);
    event SeasonLocked(uint32 indexed seasonId, uint256 totalBurned);

    error NotCurator();
    error SeasonClosed();
    error SeasonStillOpen();
    error UnknownCard();
    error ZeroAmount();

    modifier onlyCurator() {
        if (msg.sender != curator) revert NotCurator();
        _;
    }

    constructor(ILiquid _token) {
        token = _token;
        curator = msg.sender;
    }

    /// @notice Open a season's ballot with its candidate cards and a close block.
    function openSeason(uint32 seasonId, uint32[] calldata cardIds, uint64 closeBlock)
        external
        onlyCurator
    {
        Season storage s = seasons[seasonId];
        if (s.open) revert SeasonStillOpen();
        s.open = true;
        s.closeBlock = closeBlock;
        s.cardIds = cardIds;
        emit SeasonOpened(seasonId, cardIds, closeBlock);
    }

    /// @notice Burn `amount` tokens as votes for `cardId`. Conviction = combustion.
    /// The voter must `approve(ballot, amount)` on the token first. Tokens are
    /// pulled from the voter and burned in the same call, so the destroyed supply
    /// is exactly the votes cast (it registers as burn progress the renderer reads).
    function vote(uint32 seasonId, uint32 cardId, uint256 amount) external {
        Season storage s = seasons[seasonId];
        if (!s.open || block.number > s.closeBlock) revert SeasonClosed();
        if (amount == 0) revert ZeroAmount();
        if (!_isCandidate(s, cardId)) revert UnknownCard();

        // pull to this contract, then burn from this contract's balance
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom");
        token.burn(amount);

        s.tally[cardId] += amount;
        s.totalBurned += amount;
        emit Voted(seasonId, cardId, msg.sender, amount);
    }

    /// @notice Lock the season after its close block; freezes the tally.
    function lock(uint32 seasonId) external {
        Season storage s = seasons[seasonId];
        if (!s.open) revert SeasonClosed();
        if (block.number <= s.closeBlock) revert SeasonStillOpen();
        s.open = false;
        emit SeasonLocked(seasonId, s.totalBurned);
    }

    // ─── reads (used by the render contract + the site) ───

    function tally(uint32 seasonId, uint32 cardId) external view returns (uint256) {
        return seasons[seasonId].tally[cardId];
    }

    function candidates(uint32 seasonId) external view returns (uint32[] memory) {
        return seasons[seasonId].cardIds;
    }

    function totalBurned(uint32 seasonId) external view returns (uint256) {
        return seasons[seasonId].totalBurned;
    }

    /// @notice Top `k` cards by burned votes after the season is locked.
    function winners(uint32 seasonId, uint256 k) external view returns (uint32[] memory top) {
        Season storage s = seasons[seasonId];
        uint256 n = s.cardIds.length;
        if (k > n) k = n;
        top = new uint32[](k);
        bool[] memory used = new bool[](n);
        for (uint256 rank = 0; rank < k; rank++) {
            uint256 best;
            int256 bestIdx = -1;
            for (uint256 i = 0; i < n; i++) {
                if (used[i]) continue;
                uint256 v = s.tally[s.cardIds[i]];
                if (bestIdx == -1 || v > best) { best = v; bestIdx = int256(i); }
            }
            used[uint256(bestIdx)] = true;
            top[rank] = s.cardIds[uint256(bestIdx)];
        }
    }

    /// @notice Burn progress across the whole edition (0..1e18), for the pack "wax seal".
    function burnProgress() external view returns (uint256) {
        uint256 cap = token.maxTotalSupply();
        if (cap == 0) return 0;
        uint256 supply = token.totalSupply();
        uint256 burned = cap > supply ? cap - supply : 0;
        return (burned * 1e18) / cap;
    }

    function _isCandidate(Season storage s, uint32 cardId) private view returns (bool) {
        uint32[] storage ids = s.cardIds;
        for (uint256 i = 0; i < ids.length; i++) if (ids[i] == cardId) return true;
        return false;
    }
}
