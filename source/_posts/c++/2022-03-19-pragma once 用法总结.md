---

layout: post
title: "#pragma once 用法总结"
date: 2022-03-19 
tag: c++

---

# pragma once 用法总结

## pragma once 这个宏有什么用？

为了避免同一个头文件被包含（include）多次，C/C++中有两种宏实现方式：一种是#ifndef方式；另一种是#pragma once方式。

在能够支持这两种方式的编译器上，二者并没有太大的区别。但两者仍然有一些细微的区别。

## 两者的使用方式有何区别？

方式1：

```
#ifndef  __SOMEFILE_H__
#define   __SOMEFILE_H__
 ... ... // 声明、定义语句
#endif
```

方式2：

```
#pragma once
 ... ... // 声明、定义语句
```

## 两者各有和特点？

### #ifndef

1. #ifndef的方式受C/C++语言标准支持

2. 通过宏来检测，宏的范围可以是单个文件，也可以是代码片段。保证文件或者代码片段不被重复包含，针对文件的内容。

3. 可能会发生宏冲突，导致你看到头文件明明存在，但编译器却硬说找不到声明的状况（遇到过一次，查了一晚上）

### #pragma once

1. pragma once由编译器提供保证：同一个文件不会被包含多次。注意这里所说的“同一个文件”是指物理上的一个文件，而不是指内容相同的两个文件

2. #pragma once`不是一个标准的指令，但是大多的的编译器已经支持

3. `#pragma once`代替include防范将加快编译速度，ifndef方式需要先打开文件

4. 你无法对一个头文件中的一段代码作pragma once声明，而只能针对文件

5. 好处是，你不必再担心宏名冲突了，当然也就不会出现宏名冲突引发的奇怪问题

参考： [#pragma once用法总结_西北老码农的博客-CSDN博客_#pragma once](https://blog.csdn.net/fanyun_01/article/details/77413992)
