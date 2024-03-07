---

layout: post
title: "通过脚本修改xcode pbxproj文件"
date: 2022-05-11 
tag: Shell

---



## 分析 xcode pbxproj 文件格式

 创建一个新的iOS工程`demo`, 进入工程目录, 找到`project.pbxproj`。

```
➜  demo git:(main) ✗ ls
demo           demo.xcodeproj demoTests      demoUITests
➜  demo git:(main) ✗ cd demo.xcodeproj
➜  demo.xcodeproj git:(main) ✗ ls
project.pbxproj     project.xcworkspace xcuserdata
```

通过code打开看看文件内容。

> The Xcode project file is an old-style plist (Next style) based on braces to delimit the hierarchy. The file begins with an explicit encoding information, usually the UTF-8 one.

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521761658021652176165259.png)

`project.pbxproj`文件格式是旧式的plist，通过`plutil`将project.pbxproj转换为json

```
plutil -convert json project.pbxproj
```

通过可视化工具分析json内容

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521715227351652171521885.png)

rootObject 对应的value是24位16进制的UUID。

展开objects 找到`FEF5F49A2829212600E85303`对应的object

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521733421961652173342151.png)

buildConfigurationList 保存了配置信息，对应的UUID为 FEF5F49D2829212600E85303

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521737007771652173700399.png)

buildConfigurations是个数组，我们分析第一个。找到FEF5F4CF2829212700E85303对应的object

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521738897811652173889220.png)

展开buildSettings看一看

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521739817831652173981353.png)

在xcode-build settings中可以找到对应的设置。

![](https://cdn.jsdelivr.net/gh/yxibng/filebed@main/img/images/blog/16521742047871652174204307.png)

说明：

1. objects数组包含了所有object 对象的信息， 包含rootObject， rootObject 的isa 是`PBXProject`

2. 通过rootObject，根据UUID在objects数组找到对应的object, 可以构建一棵树，这棵树描述了xcode工程的所有配置信息。

## 通过脚本修改pbxproj文件的方法

1. 通过`plutil`将pbxproj转换为json或xml， 编辑转换后的json或者xml。虽然文件内容会被转换为json或者xml， 但是xcode 依然可以加载修改后的pbxproj文件。 通过xcode 修改任何配置信息后，pbxproj会被重新改写为旧式的plist文件格式。

2. 通过现成的一些工具
   
   - [GitHub - CocoaPods/Xcodeproj: Create and modify Xcode projects from Ruby.](https://github.com/CocoaPods/Xcodeproj)
   
   - [GitHub - tuist/XcodeProj: 📝 Read, update and write your Xcode projects](https://github.com/tuist/XcodeProj)
   
   - [GitHub - kronenthaler/mod-pbxproj: A python module to manipulate XCode projects](https://github.com/kronenthaler/mod-pbxproj)
   
   - [GitHub - alunny/node-xcode: tools and utilities for working with xcode/ios projects](https://github.com/alunny/node-xcode)
   
   - 

### [Xcodeproj](https://github.com/CocoaPods/Xcodeproj) 使用介绍

1. 安装
   
   ```
   gem install xcodeproj
   ```

2. 写ruby脚本，不会的可以去学一下ruby， 入门很很简单
   
   ```
   require 'xcodeproj'
   project_path = '/your_path/your_project.xcodeproj'
   project = Xcodeproj::Project.open(project_path)
   project.targets.each do |target|
     target.build_configurations.each do |config|
       config.build_settings['MY_CUSTOM_FLAG'] ||= 'TRUE'
     end
   end
   project.save
   ```

参考：

[Let's Talk About project.pbxproj](http://yulingtianxia.com/blog/2016/09/28/Let-s-Talk-About-project-pbxproj/)

[Xcode Project File Format](http://www.monobjc.net/xcode-project-file-format.html)
