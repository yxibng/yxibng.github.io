---
title: "shell output color"
date: 2019-10-12 11:45:36 +0800
categories:
  - shell 
tags:
  - shell
---

参考：[How to change the output color of echo in Linux](https://stackoverflow.com/questions/5947742/how-to-change-the-output-color-of-echo-in-linux)


使用 `tput`


```
# 1. 设置输出颜色为红色 2. 输出 this is red text 3. 将颜色重置
tput setaf 1; echo "this is red text";tput sgr 0;
```

Foreground & background colour commands

```
# Set the background colour using ANSI escape
tput setab [1-7] 
# Set the foreground colour using ANSI escape
tput setaf [1-7] 
```

Colours are as follows:


|Num| Colour|    #define |        R G B |
-----|----|-----|-----
0 |   black|     COLOR_BLACK|     0,0,0
1 |   red|       COLOR_RED|       1,0,0
2 |   green|     COLOR_GREEN |    0,1,0
3 |  yellow|    COLOR_YELLOW |   1,1,0
4 |   blue|      COLOR_BLUE   |    0,0,1
5 |   magenta|   COLOR_MAGENTA |  1,0,1
6 |   cyan|      COLOR_CYAN     | 0,1,1
7 |   white|     COLOR_WHITE    | 1,1,1

