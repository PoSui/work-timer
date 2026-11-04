# 把 app.v8.js 原样注入 index.html 的 <script> 里（字符串切片，不用 re.sub 替换串）
import io

P = "index.html"
APP = "_tests/app.v8.js"

html = io.open(P, encoding="utf-8").read()
app = io.open(APP, encoding="utf-8").read()

i = html.index("<script>")
j = html.index("</script>", i)
new = html[:i] + "<script>\n" + app.strip() + "\n" + html[j:]
io.open(P, "w", encoding="utf-8", newline="").write(new)

# 校验：重新截取脚本内容，必须与 app.v8.js strip 后完全相等
html2 = io.open(P, encoding="utf-8").read()
i2 = html2.index("<script>")
j2 = html2.index("</script>", i2)
body = html2[i2 + len("<script>"):j2].strip()
print("inject-ok:", body == app.strip(), "| html bytes:", len(html2.encode("utf-8")), "| app bytes:", len(app.encode("utf-8")))
