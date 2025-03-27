# coding:utf-8

import sys
import os
import errno
import pickle
import sqlite3
import requests
from requests.exceptions import RequestException
from termcolor import colored
from bs4 import BeautifulSoup
from youdao.config import VOICE_DIR, DB_DIR, PK_DIR


class YoudaoSpider:
    """
    通过有道获取单词解释, 以及展示查询结果
    """

    params = {
        'keyfrom': 'longcwang',
        'key': '131895274',
        'type': 'data',
        'doctype': 'json',
        'version': '1.1',
        'q': 'query'
    }
    api_url = u'http://fanyi.youdao.com/openapi.do'
    voice_url = u'http://dict.youdao.com/dictvoice?type=2&audio={word}'
    web_url = u'http://dict.youdao.com/w/eng/{0}/#keyfrom=dict2.index'

    error_code = {
        0: u'正常',
        20: u'要翻译的文本过长',
        30: u'无法进行有效的翻译',
        40: u'不支持的语言类型',
        50: u'无效的key',
        60: u'无词典结果，仅在获取词典结果生效'
    }

    def __init__(self, word):
        self.word = word
        # 重置结果为默认值，避免结果被之前的查询影响
        self.result = {
            "query": "",
            "errorCode": 0,
        }

    # __init__ 已经移到上面重新定义

    def load_from_cache(self):
        """从缓存中加载单词数据"""
        # 先尝试从 Pickle 文件加载
        if os.path.exists(PK_DIR):
            try:
                with open(PK_DIR, 'rb') as f:
                    data = pickle.load(f)
                    if self.word in data:
                        self.result = data[self.word]
                        return True
            except Exception as e:
                print(f"从 Pickle 文件加载缓存失败: {str(e)}")
        
        # 然后尝试从 SQLite 加载
        if os.path.exists(DB_DIR):
            try:
                conn = sqlite3.connect(DB_DIR)
                cursor = conn.cursor()
                cursor.execute('SELECT data FROM words WHERE word = ?', (self.word,))
                row = cursor.fetchone()
                conn.close()
                if row:
                    self.result = pickle.loads(row[0])
                    return True
            except Exception as e:
                print(f"从 SQLite 加载缓存失败: {str(e)}")
        
        return False
        
    def save_to_cache(self):
        """将单词数据保存到缓存"""
        if 'basic' not in self.result:
            return  # 只缓存有效的结果
        
        # 创建一个安全的副本，只包含必要的基本数据类型
        safe_result = self._create_safe_result_copy()
            
        # SQLite 缓存
        try:
            # 确保目录存在
            os.makedirs(os.path.dirname(DB_DIR), exist_ok=True)
            
            conn = sqlite3.connect(DB_DIR)
            cursor = conn.cursor()
            cursor.execute('CREATE TABLE IF NOT EXISTS words (word TEXT PRIMARY KEY, data BLOB)')
            
            try:
                serialized_data = pickle.dumps(safe_result, protocol=4)
                cursor.execute('INSERT OR REPLACE INTO words VALUES (?, ?)', 
                              (self.word, serialized_data))
                conn.commit()
            except RecursionError as e:
                print(f"序列化数据时出现递归错误: {str(e)}")
                # 尝试使用更简单的结构保存
                try:
                    minimal_data = {
                        'query': safe_result.get('query', ''),
                        'errorCode': safe_result.get('errorCode', 0),
                        'basic': {
                            'explains': safe_result.get('basic', {}).get('explains', [])
                        }
                    }
                    cursor.execute('INSERT OR REPLACE INTO words VALUES (?, ?)', 
                                (self.word, pickle.dumps(minimal_data, protocol=2)))
                    conn.commit()
                except Exception as inner_e:
                    print(f"尝试保存简化数据也失败: {str(inner_e)}")
            
            conn.close()
        except Exception as e:
            print(f"保存到 SQLite 缓存失败: {str(e)}")
    
    def _create_safe_result_copy(self):
        """创建一个安全的结果副本，避免循环引用和复杂对象"""
        safe_copy = {
            'query': str(self.result.get('query', '')),
            'errorCode': int(self.result.get('errorCode', 0))
        }
        
        # 复制basic部分(基本释义)
        if 'basic' in self.result:
            safe_copy['basic'] = {}
            basic = self.result['basic']
            
            # 复制音标
            if 'phonetic' in basic:
                safe_copy['basic']['phonetic'] = str(basic['phonetic'])
            if 'uk-phonetic' in basic:
                safe_copy['basic']['uk-phonetic'] = str(basic['uk-phonetic'])
            if 'us-phonetic' in basic:
                safe_copy['basic']['us-phonetic'] = str(basic['us-phonetic'])
                
            # 复制释义列表
            if 'explains' in basic:
                safe_copy['basic']['explains'] = [str(ex) for ex in basic['explains']]
        
        # 复制其他重要部分，确保使用基本数据类型
        if 'translation' in self.result:
            safe_copy['translation'] = [str(t) for t in self.result['translation']]
            
        if 'web' in self.result:
            safe_copy['web'] = []
            for item in self.result['web']:
                web_item = {'key': str(item.get('key', ''))}
                if 'value' in item:
                    web_item['value'] = [str(v) for v in item['value']]
                safe_copy['web'].append(web_item)
                
        return safe_copy
    
    def get_result(self, use_api=False, use_cache=True):
        """
        获取查询结果
        :param use_api: 是否使用有道API
        :param use_cache: 是否使用缓存
        :return: 与有道API返回的json数据一致的dict
        """
        # 先尝试从缓存加载
        if use_cache and self.load_from_cache():
            return self.result
            
        try:
            if use_api:
                self.params['q'] = self.word
                r = requests.get(self.api_url, params=self.params)
                r.raise_for_status()  # a 4XX client error or 5XX server error response
                self.result = r.json()
            else:
                r = requests.get(self.web_url.format(self.word))
                r.raise_for_status()
                self.parse_html(r.text)
                
            # 如果查询成功，保存到缓存
            if self.result['errorCode'] == 0 and 'basic' in self.result:
                self.save_to_cache()
                
        except RequestException as e:
            print(colored(u'网络错误: %s' % e, 'red'))
            return self.result
        except Exception as e:
            print(colored(f'查询错误: {str(e)}', 'red'))
            return self.result
            
        return self.result

    def parse_html(self, html):
        """
        解析web版有道的网页
        :param html:网页内容
        :return:result
        """
        soup = BeautifulSoup(html, "lxml")
        root = soup.find(id='results-contents')

        # query 搜索的关键字
        keyword = root.find(class_='keyword')
        if not keyword:
            # 可能是无效的搜索词，没有找到对应的关键词
            self.result['query'] = self.word
            # 设置错误码，表示无词典结果
            self.result['errorCode'] = 60
            return self.result
        else:
            self.result['query'] = keyword.string

        # 基本解释
        basic = root.find(id='phrsListTab')
        if basic:
            trans = basic.find(class_='trans-container')
            if trans:
                self.result['basic'] = {}
                self.result['basic']['explains'] = [tran.string for tran in trans.find_all('li')]
                # 中文
                if len(self.result['basic']['explains']) == 0:
                    exp = trans.find(class_='wordGroup').stripped_strings
                    self.result['basic']['explains'].append(' '.join(exp))

                # 音标
                phons = basic(class_='phonetic', limit=2)
                if len(phons) == 2:
                    self.result['basic']['uk-phonetic'], self.result['basic']['us-phonetic'] = \
                        [p.string[1:-1] for p in phons]
                elif len(phons) == 1:
                    self.result['basic']['phonetic'] = phons[0].string[1:-1]

        # # 翻译
        # if 'basic' not in self.result:
        #     self.result['translation'] = self.get_translation(self.word)

        # 网络释义(短语)
        web = root.find(id='webPhrase')
        if web:
            self.result['web'] = [
                {
                    'key': wordgroup.find(class_='search-js').string.strip(),
                    'value': [v.strip() for v in wordgroup.find('span').next_sibling.split(';')]
                } for wordgroup in web.find_all(class_='wordGroup', limit=4)
            ]

    @classmethod
    def get_voice(cls, word, download=True):
        """
        获取单词发音文件路径
        :param word: 单词
        :param download: 如果文件不存在是否下载
        :return: 返回音频文件路径或者None如果不存在且不下载
        """
        # 确保音频目录存在
        if not os.path.exists(VOICE_DIR):
            try:
                os.makedirs(VOICE_DIR)
            except OSError as e:
                if e.errno != errno.EEXIST:
                    raise
        
        voice_file = os.path.join(VOICE_DIR, word + '.mp3')
        
        # 如果文件已经存在，直接返回
        if os.path.isfile(voice_file):
            return voice_file
            
        # 如果不存在但需要下载
        if download:
            try:
                r = requests.get(cls.voice_url.format(word=word))
                with open(voice_file, 'wb') as f:
                    f.write(r.content)
                return voice_file
            except Exception as e:
                print(f"下载单词 '{word}' 发音出错: {str(e)}")
                return None
        
        # 如果不存在且不需要下载
        return None


if __name__ == '__main__':
    test = YoudaoSpider('application')
    print(test.get_result())
