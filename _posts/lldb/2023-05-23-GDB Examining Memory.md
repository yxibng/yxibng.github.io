---
layout: post
title: "GDB Examining Memory"
date: 2023-05-23
tag: lldb
---
参考：
[gdb/Output-Formats](https://sourceware.org/gdb/onlinedocs/gdb/Output-Formats.html)
[gdb/Memory](https://sourceware.org/gdb/onlinedocs/gdb/Memory.html#Memory)


# Output Formats

- `x` : Print the binary representation of the value in hexadecimal.
- `d`: Print the binary representation of the value in hexadecimal.
- `u`: Print the binary representation of the value as an decimal, as if it were unsigned.
- `o`: Print the binary representation of the value in octal.
- `t`: Print the binary representation of the value in binary. The letter ‘t’ stands for “two”.
- `a`: Print as an address, both absolute in hexadecimal and as an offset from the nearest preceding symbol. 
- `c`: Cast the value to an integer (unlike other formats, this does not just reinterpret the underlying bits) and print it as a character constant.
- `f`: Regard the bits of the value as a floating point number and print using typical floating point syntax.
- `s`:Regard as a string, if possible. With this format, pointers to single-byte data are displayed as null-terminated strings and arrays of single-byte data are displayed as fixed-length strings. Other values are displayed in their natural types.
- `z`:Like ‘x’ formatting, the value is treated as an integer and printed as hexadecimal, but leading zeros are printed to pad the value to the size of the integer type.
- `r`:Print using the ‘raw’ formatting. By default, GDB will use a Python-based pretty-printer, if one is available (see Pretty Printing). This typically results in a higher-level display of the value’s contents. The ‘r’ format bypasses any Python pretty-printer which might exist.


示例：
```
(lldb) p/x 10
(int) $0 = 0x0000000a
(lldb) p/t 10
(int) $1 = 0b00000000000000000000000000001010
(lldb) p/d 0x0000000a
(int) $2 = 10
(lldb) p/u 0x0000000a
(int) $3 = 10
(lldb) p/o 0x0000000a
(int) $4 = 012
(lldb) p/o 0x0000000a
```

# Examining Memory
You can use the command x (for “examine”) to examine memory in any of several formats, independently of your program’s data types.
```
x/nfu addr
x addr
```

- `n`: the repeat count
	The repeat count is a decimal integer; the default is 1. It specifies how much memory (counting by units u) to display. If a negative number is specified, memory is examined backward from addr.
- `f`: the display format
	The display format is one of the formats used by print (‘x’, ‘d’, ‘u’, ‘o’, ‘t’, ‘a’, ‘c’, ‘f’, ‘s’), ‘i’ (for machine instructions) and ‘m’ (for displaying memory tags). The default is ‘x’ (hexadecimal) initially. The default changes each time you use either x or print.
- `u`:the unit size
	The unit size is any of:
		- `b`: Bytes
		- `h`: Halfwords (two bytes).
		- `w`: Words (four bytes). This is the initial default.
		- `g`:Giant words (eight bytes).
- `addr`:starting display address
	addr is the address where you want GDB to begin displaying memory.
	You can also specify a negative repeat count to examine memory backward from the given address. For example, ‘x/-3uh 0x54320’ prints three halfwords (h) at 0x5431a, 0x5431c, and 0x5431e.
	
 示例：
 
```
# display three halfwords (h) of memory, formatted as unsigned decimal integers (‘u’), starting at address 0x54320
x/3uh 0x54320

# prints the four words (‘w’) of memory above the stack pointer in hexadecimal (‘x’)

x/4xw $sp

# prints three halfwords (h) at 0x5431a, 0x5431c, and 0x5431e.

x/-3uh 0x54320

```