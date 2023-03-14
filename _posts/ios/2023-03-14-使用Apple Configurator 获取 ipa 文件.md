
---

layout: post
title: "使用 Apple Configurator 获取 ipa 文件"
date: 2023-03-14
tag: iOS

---


参考：[Apple Configuration 2 获取ipa文件](https://www.jianshu.com/p/86f35a6a64a7)


# 工具 Apple Configurator

可以在 Mac 的 App Store 中下载

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16787776997821678777699715.png)



# 操作

1. 连接手机

2. 点击 Add -> Apps -> 输入 app 名字 -> 点击添加

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16787779407831678777940467.png)

3. 等待下载完成, 不要操作

![](https://fastly.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16787783759431678778375920.png)

4. 去目录里找 ipa 文件

```
~/Library/Group Containers/K36BKF7T3D.group.com.apple.configurator/Library/Caches/Assets/TemporaryItems/MobileApps/36244314-7400-420B-BC2A-AC3C4988F115/414478124/WeChat 8.0.33.ipa
```

