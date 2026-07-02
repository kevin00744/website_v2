# 字型檔案

`NotoSansTC-Regular.ttf` 不進 git（檔案太大，~7MB），重新取得方式：

```bash
curl -sL -o NotoSansTC-Regular.ttf \
  "https://fonts.gstatic.com/s/notosanstc/v39/-nFuOG829Oofr2wohFbTp9ifNAn722rq0MXz76Cy_Co.ttf"
```

來源：Google Fonts CDN（`fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400` 解析出的實際字重檔），OFL 開源授權，可商用。

注意：這是**單一靜態字重（static instance）**的 TTF，不是可變字型（variable font）。
早期版本用過 `google/fonts` repo 裡的可變字型（`NotoSansTC[wght].ttf`），但搭配 pdf-lib 的
`embedFont(..., { subset: true })` 子集化時，會在小字符集（例如只有日期用到的幾個數字）情況下
不穩定地漏字（渲染成亂碼）。換成靜態字重後子集化恢復正常，且因為單一字重沒有可變軸資料，
原始檔案就小了將近 40%，子集化後嵌入 PDF 的實際大小更是大幅縮減。

用途：`apps/api/src/customers/disclaimer-pdf.util.ts` 產生免責聲明書 PDF 時嵌入中文字型。
