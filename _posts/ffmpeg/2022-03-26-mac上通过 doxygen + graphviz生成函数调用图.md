---
layout: post
title: "mac上通过 doxygen + graphviz生成函数调用图"
date: 2022-03-26
tag: ffmpeg
---



安装[Doxygen](https://www.doxygen.nl/index.html)

```
brew install doxygen
brew install doxygen --cask
```

安装[Graphviz](https://graphviz.org/)

```
brew install graphviz
```

## 配置doxygen

配置工作目录，源码目录，生成文档目录

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482609835051648260982959.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482610615021648261060637.png)

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482621994932022-03-26-10-18-39-image.png)

配置DOT_PATH

```
➜  ~ which dot
/opt/homebrew/bin/dot
```

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482622484922022-03-26-10-19-09-image.png)

生成文档和函数调用图

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482622864902022-03-26-10-19-27-image.png)

## 查看函数调用图

```
➜  ff_doc ls
html  latex
➜  ff_doc cd html
➜  html open index.html
```

文档生成目录下，打开`html/index.html`

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482623074922022-03-26-10-26-47-image.png)

可以看到生成的函数调用图

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16482623224912022-03-26-10-28-07-image.png)
