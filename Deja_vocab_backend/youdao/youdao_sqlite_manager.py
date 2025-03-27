#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
import json
import pickle
import sqlite3
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import datetime

# 确保目录结构正确
script_dir = os.path.dirname(os.path.abspath(__file__))
if script_dir not in sys.path:
    sys.path.append(script_dir)

# 导入有道词典配置
from youdao.config import DB_DIR


class YoudaoSQLiteManager:
    """有道词典SQLite数据库管理工具"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("有道词典SQLite数据库管理器")
        self.root.geometry("1100x700")
        
        # 设置样式
        style = ttk.Style()
        style.configure("TButton", font=("Arial", 11))
        style.configure("TLabel", font=("Arial", 11))
        style.configure("Treeview", font=("Arial", 11))
        style.configure("Treeview.Heading", font=("Arial", 11, "bold"))
        
        # 创建主框架
        self.main_frame = ttk.Frame(root, padding="10")
        self.main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 创建顶部工具栏
        self.toolbar_frame = ttk.Frame(self.main_frame)
        self.toolbar_frame.pack(fill=tk.X, pady=(0, 10))
        
        # 数据库路径显示
        ttk.Label(self.toolbar_frame, text="数据库:").pack(side=tk.LEFT, padx=(0, 5))
        self.db_path_var = tk.StringVar(value=DB_DIR)
        db_path_entry = ttk.Entry(self.toolbar_frame, textvariable=self.db_path_var, width=40, state="readonly")
        db_path_entry.pack(side=tk.LEFT, padx=(0, 10))
        
        # 搜索框
        ttk.Label(self.toolbar_frame, text="搜索:").pack(side=tk.LEFT, padx=(0, 5))
        self.search_var = tk.StringVar()
        self.search_entry = ttk.Entry(self.toolbar_frame, textvariable=self.search_var, width=20)
        self.search_entry.pack(side=tk.LEFT, padx=(0, 5))
        
        # 搜索按钮
        self.search_button = ttk.Button(self.toolbar_frame, text="搜索", command=self.search_entries)
        self.search_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # 刷新按钮
        self.refresh_button = ttk.Button(self.toolbar_frame, text="刷新", command=self.refresh_entries)
        self.refresh_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # 导出按钮
        self.export_button = ttk.Button(self.toolbar_frame, text="导出选中", command=self.export_selected)
        self.export_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # 删除按钮
        self.delete_button = ttk.Button(self.toolbar_frame, text="删除选中", command=self.delete_selected)
        self.delete_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # 清空按钮
        self.clear_button = ttk.Button(self.toolbar_frame, text="清空数据库", command=self.clear_database)
        self.clear_button.pack(side=tk.LEFT, padx=(0, 5))
        
        # 数据库信息标签
        self.db_info_label = ttk.Label(self.toolbar_frame, text="")
        self.db_info_label.pack(side=tk.RIGHT)
        
        # 创建表格和详情分隔区域
        self.paned_window = ttk.PanedWindow(self.main_frame, orient=tk.HORIZONTAL)
        self.paned_window.pack(fill=tk.BOTH, expand=True)
        
        # 创建表格视图
        self.create_treeview()
        
        # 创建详情视图
        self.create_details_view()
        
        # 绑定事件
        self.search_entry.bind("<Return>", lambda e: self.search_entries())
        
        # 初始加载数据
        self.refresh_entries()
        
    def create_treeview(self):
        """创建表格视图"""
        self.tree_frame = ttk.Frame(self.paned_window)
        self.paned_window.add(self.tree_frame, weight=1)
        
        # 创建表格和滚动条
        self.tree = ttk.Treeview(self.tree_frame, columns=("word"), show="headings", selectmode="browse")
        
        # 设置列宽和标题
        self.tree.column("word", width=200)
        self.tree.heading("word", text="单词")
        
        # 添加垂直滚动条
        v_scrollbar = ttk.Scrollbar(self.tree_frame, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=v_scrollbar.set)
        
        # 添加水平滚动条
        h_scrollbar = ttk.Scrollbar(self.tree_frame, orient=tk.HORIZONTAL, command=self.tree.xview)
        self.tree.configure(xscrollcommand=h_scrollbar.set)
        
        # 布局
        self.tree.grid(row=0, column=0, sticky="nsew")
        v_scrollbar.grid(row=0, column=1, sticky="ns")
        h_scrollbar.grid(row=1, column=0, sticky="ew")
        
        self.tree_frame.grid_rowconfigure(0, weight=1)
        self.tree_frame.grid_columnconfigure(0, weight=1)
        
        # 绑定选择事件
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)
        
    def create_details_view(self):
        """创建详情视图"""
        self.details_frame = ttk.LabelFrame(self.paned_window, text="详细信息")
        self.paned_window.add(self.details_frame, weight=2)
        
        # 创建文本区域和滚动条
        self.details_text = tk.Text(self.details_frame, wrap=tk.WORD)
        scrollbar = ttk.Scrollbar(self.details_frame, orient=tk.VERTICAL, command=self.details_text.yview)
        self.details_text.configure(yscrollcommand=scrollbar.set)
        
        # 添加样式标签
        self.details_text.tag_configure("title", font=("Helvetica", 14, "bold"))
        self.details_text.tag_configure("subtitle", font=("Helvetica", 12, "bold"))
        self.details_text.tag_configure("normal", font=("Helvetica", 11))
        self.details_text.tag_configure("code", font=("Courier New", 10))
        
        # 布局
        self.details_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
    def connect_to_db(self):
        """连接到SQLite数据库"""
        try:
            if not os.path.exists(DB_DIR):
                messagebox.showinfo("提示", f"数据库文件不存在: {DB_DIR}\n将创建新数据库。")
                # 确保目录存在
                os.makedirs(os.path.dirname(DB_DIR), exist_ok=True)
            
            conn = sqlite3.connect(DB_DIR)
            return conn
        except Exception as e:
            messagebox.showerror("错误", f"连接数据库失败: {str(e)}")
            return None
            
    def refresh_entries(self):
        """刷新数据库条目"""
        # 清空表格
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # 连接数据库
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            
            # 确保表存在
            cursor.execute("CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, data BLOB)")
            
            # 查询所有单词
            cursor.execute("SELECT word FROM words ORDER BY word COLLATE NOCASE")
            rows = cursor.fetchall()
            
            # 更新数据库信息
            self.db_info_label.config(text=f"总条目数: {len(rows)}")
            
            # 填充表格
            for row in rows:
                self.tree.insert("", "end", values=(row[0],))
                
            # 清空详情视图
            self.details_text.delete(1.0, tk.END)
            self.details_text.insert(tk.END, "选择一个单词查看详细信息", "subtitle")
            
        except Exception as e:
            messagebox.showerror("错误", f"刷新数据失败: {str(e)}")
        finally:
            conn.close()
            
    def search_entries(self):
        """搜索数据库条目"""
        search_text = self.search_var.get().strip()
        if not search_text:
            self.refresh_entries()
            return
            
        # 清空表格
        for item in self.tree.get_children():
            self.tree.delete(item)
            
        # 连接数据库
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            
            # 使用LIKE进行模糊查询
            cursor.execute("SELECT word FROM words WHERE word LIKE ? ORDER BY word COLLATE NOCASE", (f"%{search_text}%",))
            rows = cursor.fetchall()
            
            # 更新数据库信息
            self.db_info_label.config(text=f"搜索结果: {len(rows)} 条")
            
            # 填充表格
            for row in rows:
                self.tree.insert("", "end", values=(row[0],))
                
        except Exception as e:
            messagebox.showerror("错误", f"搜索失败: {str(e)}")
        finally:
            conn.close()
            
    def on_tree_select(self, event):
        """处理表格选择事件"""
        selected_items = self.tree.selection()
        if not selected_items:
            return
            
        # 获取选中的单词
        item = selected_items[0]
        values = self.tree.item(item, "values")
        if not values:
            return
            
        word = values[0]
        
        # 查询单词详细信息
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM words WHERE word = ?", (word,))
            row = cursor.fetchone()
            
            if not row:
                self.details_text.delete(1.0, tk.END)
                self.details_text.insert(tk.END, f"未找到单词 '{word}' 的详细信息", "subtitle")
                return
                
            # 反序列化数据
            data = pickle.loads(row[0])
            
            # 清空详情视图
            self.details_text.delete(1.0, tk.END)
            
            # 显示基本信息
            self.details_text.insert(tk.END, f"{word}\n", "title")
            
            # 显示查询结果
            if 'query' in data and data['query'] != word:
                self.details_text.insert(tk.END, f"查询词: {data['query']}\n", "normal")
                
            # 显示音标
            if 'basic' in data:
                phonetics = []
                if 'us-phonetic' in data['basic'] and data['basic']['us-phonetic']:
                    phonetics.append(f"美 [{data['basic']['us-phonetic']}]")
                if 'uk-phonetic' in data['basic'] and data['basic']['uk-phonetic']:
                    phonetics.append(f"英 [{data['basic']['uk-phonetic']}]")
                if 'phonetic' in data['basic'] and data['basic']['phonetic'] and not phonetics:
                    phonetics.append(f"[{data['basic']['phonetic']}]")
                
                if phonetics:
                    self.details_text.insert(tk.END, " ".join(phonetics) + "\n\n", "normal")
                    
                # 显示基本释义
                if 'explains' in data['basic'] and data['basic']['explains']:
                    self.details_text.insert(tk.END, "基本词典:\n", "subtitle")
                    for explain in data['basic']['explains']:
                        self.details_text.insert(tk.END, f"\t{explain}\n", "normal")
                    self.details_text.insert(tk.END, "\n", "normal")
                        
            # 显示网络释义
            if 'web' in data and data['web']:
                self.details_text.insert(tk.END, "网络释义:\n", "subtitle")
                for item in data['web']:
                    key = item.get('key', '')
                    values = item.get('value', [])
                    self.details_text.insert(tk.END, f"\t{key}: {'; '.join(values)}\n", "normal")
                self.details_text.insert(tk.END, "\n", "normal")
                    
            # 显示原始数据（用于调试）
            self.details_text.insert(tk.END, "原始数据:\n", "subtitle")
            self.details_text.insert(tk.END, json.dumps(data, ensure_ascii=False, indent=2), "code")
            
        except Exception as e:
            self.details_text.delete(1.0, tk.END)
            self.details_text.insert(tk.END, f"加载详情失败: {str(e)}", "subtitle")
            import traceback
            self.details_text.insert(tk.END, f"\n\n{traceback.format_exc()}", "code")
        finally:
            conn.close()
            
    def export_selected(self):
        """导出选中的单词数据"""
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showinfo("提示", "请先选择要导出的单词")
            return
            
        # 获取选中的单词
        item = selected_items[0]
        values = self.tree.item(item, "values")
        if not values:
            return
            
        word = values[0]
        
        # 查询单词详细信息
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM words WHERE word = ?", (word,))
            row = cursor.fetchone()
            
            if not row:
                messagebox.showinfo("提示", f"未找到单词 '{word}' 的详细信息")
                return
                
            # 反序列化数据
            data = pickle.loads(row[0])
            
            # 格式化导出数据
            export_data = self.format_for_export(word, data)
            
            # 显示导出数据
            export_window = tk.Toplevel(self.root)
            export_window.title(f"导出数据 - {word}")
            export_window.geometry("600x500")
            
            export_frame = ttk.Frame(export_window, padding="10")
            export_frame.pack(fill=tk.BOTH, expand=True)
            
            export_text = tk.Text(export_frame, wrap=tk.WORD)
            scrollbar = ttk.Scrollbar(export_frame, orient=tk.VERTICAL, command=export_text.yview)
            export_text.configure(yscrollcommand=scrollbar.set)
            
            export_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
            scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
            
            export_text.insert(tk.END, export_data)
            
            # 添加按钮
            button_frame = ttk.Frame(export_window)
            button_frame.pack(fill=tk.X, pady=10)
            
            copy_button = ttk.Button(button_frame, text="复制到剪贴板", 
                                    command=lambda: self.copy_to_clipboard(export_window, export_data))
            copy_button.pack(side=tk.RIGHT, padx=5)
            
            close_button = ttk.Button(button_frame, text="关闭", 
                                    command=export_window.destroy)
            close_button.pack(side=tk.RIGHT, padx=5)
            
        except Exception as e:
            messagebox.showerror("错误", f"导出数据失败: {str(e)}")
        finally:
            conn.close()
            
    def format_for_export(self, word, data):
        """格式化数据用于导出"""
        lines = []
        lines.append(f"单词: {word}")
        
        # 音标
        if 'basic' in data:
            phonetics = []
            if 'us-phonetic' in data['basic'] and data['basic']['us-phonetic']:
                phonetics.append(f"美 [{data['basic']['us-phonetic']}]")
            if 'uk-phonetic' in data['basic'] and data['basic']['uk-phonetic']:
                phonetics.append(f"英 [{data['basic']['uk-phonetic']}]")
            if 'phonetic' in data['basic'] and data['basic']['phonetic'] and not phonetics:
                phonetics.append(f"[{data['basic']['phonetic']}]")
            
            if phonetics:
                lines.append(" ".join(phonetics))
                
            # 基本释义
            if 'explains' in data['basic'] and data['basic']['explains']:
                lines.append("\n基本词典:")
                for explain in data['basic']['explains']:
                    lines.append(f"\t{explain}")
                    
        # 网络释义
        if 'web' in data and data['web']:
            lines.append("\n网络释义:")
            for item in data['web']:
                key = item.get('key', '')
                values = item.get('value', [])
                lines.append(f"\t{key}: {'; '.join(values)}")
                
        return "\n".join(lines)
            
    def copy_to_clipboard(self, window, text):
        """复制文本到剪贴板"""
        window.clipboard_clear()
        window.clipboard_append(text)
        messagebox.showinfo("提示", "已复制到剪贴板")
            
    def delete_selected(self):
        """删除选中的条目"""
        selected_items = self.tree.selection()
        if not selected_items:
            messagebox.showinfo("提示", "请先选择要删除的单词")
            return
            
        # 获取选中的单词
        item = selected_items[0]
        values = self.tree.item(item, "values")
        if not values:
            return
            
        word = values[0]
        
        # 确认删除
        if not messagebox.askyesno("确认", f"确定要删除单词 '{word}' 吗?"):
            return
            
        # 连接数据库
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM words WHERE word = ?", (word,))
            conn.commit()
            
            # 从表格中移除
            self.tree.delete(item)
            
            # 更新数据库信息
            cursor.execute("SELECT COUNT(*) FROM words")
            count = cursor.fetchone()[0]
            self.db_info_label.config(text=f"总条目数: {count}")
            
            # 清空详情视图
            self.details_text.delete(1.0, tk.END)
            self.details_text.insert(tk.END, f"已删除单词 '{word}'", "subtitle")
            
            messagebox.showinfo("成功", f"已删除单词 '{word}'")
            
        except Exception as e:
            messagebox.showerror("错误", f"删除失败: {str(e)}")
        finally:
            conn.close()
            
    def clear_database(self):
        """清空数据库"""
        # 确认清空
        if not messagebox.askyesno("确认", "确定要清空整个数据库吗? 此操作不可撤销!"):
            return
            
        # 二次确认
        confirm = simpledialog.askstring("二次确认", "请输入'CONFIRM'以确认清空数据库:", parent=self.root)
        if confirm != "CONFIRM":
            messagebox.showinfo("取消", "已取消清空操作")
            return
            
        # 连接数据库
        conn = self.connect_to_db()
        if not conn:
            return
            
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM words")
            conn.commit()
            
            # 清空表格
            for item in self.tree.get_children():
                self.tree.delete(item)
                
            # 更新数据库信息
            self.db_info_label.config(text="总条目数: 0")
            
            # 清空详情视图
            self.details_text.delete(1.0, tk.END)
            self.details_text.insert(tk.END, "数据库已清空", "subtitle")
            
            messagebox.showinfo("成功", "数据库已清空")
            
        except Exception as e:
            messagebox.showerror("错误", f"清空数据库失败: {str(e)}")
        finally:
            conn.close()


if __name__ == "__main__":
    root = tk.Tk()
    app = YoudaoSQLiteManager(root)
    root.mainloop()
