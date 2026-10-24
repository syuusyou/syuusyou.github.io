---
title: Python 例外處理指南：用 try-except 寫出優雅又強健的程式碼
date: 2026-10-24
category: Python 筆記
readTime: 5 分鐘閱讀
excerpt: 程式執行時難免會遇到檔案不存在、網路斷線或型別轉換失敗。透過 Python 的 try / except / else / finally 機制，我們能優雅地捕捉錯誤並維持系統穩定。
---

在撰寫 Python 腳本或自動化工具時，最怕遇到執行到一半因為非預期的輸入而直接崩潰（Crash）。這時候 **例外處理（Exception Handling）** 就是我們的好幫手。

## 1. 基本語法：try 與 except

當我們把可能會發生錯誤的程式碼放進 `try` 區塊中，一旦發生錯誤，Python 就不會直接中斷程式，而是跳進對應的 `except` 區塊進行處理：

```python
def divide_numbers(a: float, b: float) -> float | None:
    try:
        result = a / b
        return result
    except ZeroDivisionError:
        print("錯誤：除數不能為 0！")
        return None
    except TypeError as err:
        print(f"型別錯誤，請輸入數字：{err}")
        return None

print(divide_numbers(10, 2))   # 輸出: 5.0
print(divide_numbers(10, 0))   # 輸出: 錯誤：除數不能為 0！
```

> 「永遠優先捕捉具體的例外類別（如 `ValueError`、`KeyError`），避免使用空白的 `except:` 把所有系統錯誤都吞掉。」

## 2. 完整結構：加上 else 與 finally

Python 的例外處理其實有 **四個完整的子句**，能讓程式邏輯切分得非常乾淨：

- `try`：放可能會拋出例外的操作（範圍越小越精準越好）。
- `except`：當 `try` 發生指定例外時執行。
- `else`：**只有當 `try` 完全沒有發生任何例外時**才會執行。
- `finally`：**無論有沒有發生例外**，最後一定會執行的清理動作（例如關閉連線或釋放硬體資源）。

```python
import json

def load_config(filepath: str) -> dict:
    file_handle = None
    try:
        file_handle = open(filepath, "r", encoding="utf-8")
        data = json.load(file_handle)
    except FileNotFoundError:
        print(f"找不到設定檔 {filepath}，將使用預設設定。")
        return {"theme": "dark", "retry": 3}
    except json.JSONDecodeError as e:
        print(f"JSON 格式解析失敗 (行 {e.lineno})：{e.msg}")
        raise
    else:
        print(f"成功載入設定檔，共包含 {len(data)} 個設定項目！")
        return data
    finally:
        if file_handle is not None:
            file_handle.close()
            print("已安全關閉檔案資源。")
```

## 3. 實戰常見技巧：主動拋出例外 (raise)

有時候我們在檢查函式參數時，發現數值不符合規範，也可以使用 `raise` 主動拋出例外，讓呼叫端清楚知道問題所在：

```python
def set_wifi_tx_power(dbm: int) -> None:
    if not (0 <= dbm <= 30):
        raise ValueError(f"TX Power 必須介於 0 到 30 dBm 之間，收到：{dbm}")
    print(f"已將 WiFi 發射功率設定為 {dbm} dBm")

# 測試呼叫
try:
    set_wifi_tx_power(20)
    set_wifi_tx_power(45)
except ValueError as err:
    print(f"[設定失敗] {err}")
```

善用 `try-except` 不僅能提升程式的容錯率，搭配清楚的錯誤訊息，在日後除錯（Debugging）時也能省下大量的時間！
