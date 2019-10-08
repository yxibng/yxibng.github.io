---
title: "objctive-c format"
date: 2019-10-08 15:28:36 +0800
categories:
  - ios  
tags:
  - shell
---

参考文章：

- [让你的代码自动格式化](https://juejin.im/post/5a6989dff265da3e2e62af2d)
- [https://github.com/square/spacecommander](https://github.com/square/spacecommander)



1. clone 

	```
	cd $DIR
	git clone https://juejin.im/post/5a6989dff265da3e2e62af2d

	```
 	
2. install in your repo

	```
	cd $YOUR_REPO
	bash $DIR/spacecommander/setup-repo.sh
	```
	
3. add alias to `.zshrc` or `.bash_profile`

	```
	// 初始化
	alias clangformatsetup="$DIR/spacecommander/setup-repo.sh"
	// 格式化对应文件
	alias clangformatfile="$DIR/spacecommander/format-objc-file.sh"
	// 格式化所有暂存文件
	alias clangformatfiles="$DIR/spacecommander/format-objc-files.sh"
	// 格式化整个仓库
	alias clangformatall="$DIR/spacecommander/format-objc-files-in-repo.sh

	```

