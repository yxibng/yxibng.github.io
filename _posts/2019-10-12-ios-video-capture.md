---
title: "iOS video capture"
date: 2019-10-12 11:45:36 +0800
categories:
  - ios 
tags:
  - ios
---

# 支持的格式

```
(lldb) po [[[AVCaptureVideoDataOutput alloc] init] availableVideoCVPixelFormatTypes]
<__NSArrayI 0x281296910>(
875704438,
875704422,
1111970369
)
```

获取对应的字符串，参考[Getting actual NSString of AvCaptureVideoDataOutput availableVideoCVPixelFormatTypes](https://stackoverflow.com/questions/14537897/getting-actual-nsstring-of-avcapturevideodataoutput-availablevideocvpixelformatt)


| Decimal| Hex| ASCII | Key |
|----|----|-----|-----|
875704438 | 34323076 | 420v | kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
875704422 | 34323066 | 420f | kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
1111970369 | 42475241 | BGRA | kCVPixelFormatType_32BGRA

得到支持的格式为：

- kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
- kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
- kCVPixelFormatType_32BGRA







