---
layout: post
title: "常用的shell语句"
date: 2022-02-24
tag: Shell
---  


# 常用的shell语句

[判断软件是否安装](https://blog.csdn.net/baidu_26678247/article/details/103024812)

```
#!/bin/bash

if [ ! -x "$(command -v xcodeproj)" ]; then 
    echo "xcodeproj is not installed. installing..." > &2
    echo "run 'gem install xcodeproj'"
    gem install xcodeproj
fi
```

[当前shell脚本所在目录](https://stackoverflow.com/questions/242538/unix-shell-script-find-out-which-directory-the-script-file-resides)

```
SCRIPT_DIR="$(cd "$(dirname "$0")"; pwd)";
```
