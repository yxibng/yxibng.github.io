---
title: "UIAlertController is Crashed (iPad)"
date: 2019-09-24 09:56:36 +0800
categories:
  - ios  
tags:
  - ios
---


参考： [UIAlertController is Crashed (iPad)](https://stackoverflow.com/questions/31577140/uialertcontroller-is-crashed-ipad)


```

func onClickRate(button: UIButton) {
	let sheet = UIAlertController.init(title: "提示", message: "选择播放速率", preferredStyle: .actionSheet)
	sheet.addAction(UIAlertAction.init(title: "1.0", style: .default, handler: { (action) in
		print("1.0")
	}))
	sheet.addAction(UIAlertAction.init(title: "1.5", style: .default, handler: { (action) in
		print("1.5")
	}))
	
	sheet.addAction(UIAlertAction.init(title: "2.0", style: .default, handler: { (action) in
		print("2.0")
	}))
	
	sheet.addAction(UIAlertAction.init(title: "cancel", style: .destructive, handler: nil))
	if let popoverPresentationController = sheet.popoverPresentationController {
		popoverPresentationController.sourceView = button
		popoverPresentationController.sourceRect = button.bounds
	}
	self.present(sheet, animated: true, completion: nil)
}
```
