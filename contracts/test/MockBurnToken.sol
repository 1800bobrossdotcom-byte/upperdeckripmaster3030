// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/* Test double for the $3030 ERC-20: the minimum PackSink touches — transfer, transferFrom,
 * balanceOf, burn(uint256). Test-only; never deployed.
 *
 * ⚑ `failTransfers` exists so the tests can prove PackSink CHECKS RETURN VALUES. Plenty of real
 *   ERC-20s return false instead of reverting, and an unchecked transfer would mean a pack
 *   recorded as paid that never moved a token. A mock that can only succeed cannot test that.
 */
contract MockBurnToken {
    string public name = "mock3030";
    string public symbol = "3030";
    uint8  public decimals = 18;
    uint256 public totalSupply;
    bool public failTransfers;                       // flip to make every transfer return false

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount; totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }
    function setFailTransfers(bool v) external { failTransfers = v; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    function transfer(address to, uint256 amount) public returns (bool) {
        if (failTransfers) return false;
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount; balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        require(balanceOf[from] >= amount, "bal");
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount; balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
    /* Burn from the CALLER — the same shape as OZ's ERC20Burnable, which is what the live token
     * exposes (selector 0x42966c68, the one js/wallet.js already calls). */
    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount; totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }
}
