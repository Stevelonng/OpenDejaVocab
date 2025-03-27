import tkinter as tk
from tkinter import ttk, messagebox
from youdao.spider import YoudaoSpider
from youdao.model import Word, db
import json
import datetime

class YoudaoGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("有道词典")
        
        # 设置窗口大小和位置
        window_width = 600
        window_height = 400
        screen_width = root.winfo_screenwidth()
        screen_height = root.winfo_screenheight()
        center_x = int(screen_width/2 - window_width/2)
        center_y = int(screen_height/2 - window_height/2)
        self.root.geometry(f'{window_width}x{window_height}+{center_x}+{center_y}')

        # 创建主框架
        main_frame = ttk.Frame(root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)

        # 搜索框和按钮
        self.search_var = tk.StringVar()
        search_frame = ttk.Frame(main_frame)
        search_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        search_frame.columnconfigure(0, weight=1)

        self.search_entry = ttk.Entry(search_frame, textvariable=self.search_var)
        self.search_entry.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 5))
        
        search_button = ttk.Button(search_frame, text="查询", command=self.search)
        search_button.grid(row=0, column=1)
        
        clear_button = ttk.Button(search_frame, text="清空缓存", command=self.clear_cache)
        clear_button.grid(row=0, column=2, padx=(5, 0))

        # 结果显示区域
        result_frame = ttk.Frame(main_frame)
        result_frame.grid(row=1, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        result_frame.columnconfigure(0, weight=1)
        result_frame.rowconfigure(0, weight=1)

        # 创建文本框并添加滚动条
        self.result_text = tk.Text(result_frame, wrap=tk.WORD, width=50, height=20)
        scrollbar = ttk.Scrollbar(result_frame, orient=tk.VERTICAL, command=self.result_text.yview)
        self.result_text.configure(yscrollcommand=scrollbar.set)
        
        # 添加文本标签
        self.result_text.tag_configure("error", foreground="red", font=("Helvetica", 12, "bold"))
        self.result_text.tag_configure("warning", foreground="orange", font=("Helvetica", 12, "bold"))
        self.result_text.tag_configure("title", font=("Helvetica", 14, "bold"))
        self.result_text.tag_configure("subtitle", font=("Helvetica", 12, "bold"))
        self.result_text.tag_configure("normal", font=("Helvetica", 11))
        
        self.result_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))

        # 绑定回车键
        self.search_entry.bind('<Return>', lambda e: self.search())
        
        # 设置焦点到搜索框
        self.search_entry.focus()

    def format_result(self, result):
        self.use_warning_tag = False
        if 'errorCode' not in result or result['errorCode'] != 0:
            self.use_warning_tag = True
            return "未找到结果"

        output = []
        # 添加查询的词
        output.append(f"[{result['query']}]\n")

        # 添加音标
        if 'basic' in result:
            if 'us-phonetic' in result['basic']:
                output.append(f"美音: [{result['basic']['us-phonetic']}]")
            if 'uk-phonetic' in result['basic']:
                output.append(f"英音: [{result['basic']['uk-phonetic']}]")
            if 'phonetic' in result['basic']:
                output.append(f"拼音: [{result['basic']['phonetic']}]")

            # 添加基本释义
            if 'explains' in result['basic'] and result['basic']['explains']:
                output.append("\n基本词典:")
                for explain in result['basic']['explains']:
                    output.append(f"\t{explain}")

        # 添加网络释义
        if 'web' in result and result['web']:
            output.append("\n网络释义:")
            for item in result['web']:
                output.append(f"\t{item['key']}: {'; '.join(item['value'])}")

        return "\n".join(output)

    def search(self):
        keyword = self.search_var.get().strip()
        if not keyword:
            return

        # 清空结果显示区域
        self.result_text.delete(1.0, tk.END)
        
        # 显示正在查询的提示
        self.result_text.insert(tk.END, f"正在查询 '{keyword}'...", "subtitle")
        self.root.update()
        
        # 检查数据库中是否有符合条件的结果
        word = None
        try:
            # 按照精确匹配的关键词查询
            word = Word.select().where(Word.keyword == keyword).get()
            if word:
                result = json.loads(word.json_data)
                # 确保在结果中有基本词典
                if not ('basic' in result and 'explains' in result['basic'] and result['basic']['explains']):
                    # 没有基本词典的结果不算有效
                    word = None
                else:
                    # 更新查询计数器
                    word.query_time = datetime.datetime.now()
                    word.count += 1
                    word.save()
        except Word.DoesNotExist:
            word = None
        
        # 如果数据库中没有结果，尝试在线查询
        if not word:
            try:
                # 使用爬虫查询结果
                spider = YoudaoSpider(keyword)
                result = spider.get_result(use_api=False)
                
                # 确保查询结果和请求的关键词一致，并且有基本词典
                if result['query'].lower() != keyword.lower() or not ('basic' in result and 'explains' in result['basic'] and result['basic']['explains']):
                    # 清空结果显示区域
                    self.result_text.delete(1.0, tk.END)
                    warning_message = f"⚠️ 未找到 '{keyword}' 的释义，请检查拼写是否正确。"
                    self.result_text.insert(tk.END, warning_message, "warning")
                    return
                
                # 以上条件已经合并到上面的if语句中
                
                # 保存有效结果到数据库
                new_word = Word()
                new_word.keyword = keyword
                new_word.json_data = json.dumps(result)
                new_word.save()
                
            except Exception as e:
                # 清空结果显示区域
                self.result_text.delete(1.0, tk.END)
                self.result_text.insert(tk.END, f"查询出错: {str(e)}\n\n请检查网络连接。", "error")
                return
        else:
            # 使用数据库中的结果
            result = json.loads(word.json_data)
            
            # 二次检查查询词并与结果匹配
            if result['query'].lower() != keyword.lower():
                self.result_text.delete(1.0, tk.END)
                warning_message = f"⚠️ 数据库缓存异常，请清空缓存后重试。"
                self.result_text.insert(tk.END, warning_message, "warning")
                return

        # 清空结果显示区域
        self.result_text.delete(1.0, tk.END)
        
        # 格式化并显示结果
        formatted_result = self.format_result(result)
        
        # 应用适当的标签
        if self.use_warning_tag:
            self.result_text.insert(tk.END, formatted_result, "warning")
        else:
            # 插入标题
            lines = formatted_result.split('\n')
            self.result_text.insert(tk.END, lines[0] + '\n', "title")
            
            # 插入其余内容
            remaining_text = '\n'.join(lines[1:])
            self.result_text.insert(tk.END, remaining_text, "normal")


    def clear_cache(self):
        """清空所有缓存的单词和词组"""
        # 显示确认对话框
        confirm = messagebox.askyesno("清空缓存", "确定要清空所有缓存吗？\n\n这将删除所有已查询过的单词和词组。")
        if not confirm:
            return
            
        try:
            # 删除所有单词记录
            query = Word.delete()
            deleted_count = query.execute()
            
            # 压缩数据库文件
            db.execute_sql('VACUUM;')
            
            # 显示成功消息
            messagebox.showinfo("清空缓存", f"成功删除 {deleted_count} 条缓存记录")
            
            # 清空结果显示区域
            self.result_text.delete(1.0, tk.END)
            self.result_text.insert(tk.END, "缓存已清空", "subtitle")
        except Exception as e:
            messagebox.showerror("错误", f"清空缓存失败: {str(e)}")


def main():
    root = tk.Tk()
    app = YoudaoGUI(root)
    root.mainloop()


if __name__ == '__main__':
    main()
