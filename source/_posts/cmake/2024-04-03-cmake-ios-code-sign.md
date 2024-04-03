---
layout: post
title: "CMake ios code signing"
date: 2024-04-03
tag: cmake
---

# Error Message
When I build soundtouch for ios, met following error

```
error: Bundle identifier is missing. soundstretch doesn't have a bundle identifier. Add a value for PRODUCT_BUNDLE_IDENTIFIER in the build settings editor. (in target 'soundstretch' from project 'SoundTouch')
note: Run script build phase 'Generate CMakeFiles/ALL_BUILD' will be run during every build because the option to run the script phase "Based on dependency analysis" is unchecked. (in target 'ALL_BUILD' from project 'SoundTouch')
```

# Solve Method

1. skip cmake ios code signing

add code below to your CMakeLists.txt to disable code signing

```
set(CMAKE_XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED "NO")
```

2. support code signing

refer to page: [Code Signing macOs application](https://discourse.cmake.org/t/code-signing-macos-application/7275)

```
set(CMAKE_XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "97Z2ARC25P")
set(CMAKE_XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY "Developer ID Application")
set(CMAKE_XCODE_ATTRIBUTE_CODE_SIGN_STYLE "Manual")

```


