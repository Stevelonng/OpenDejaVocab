# coding: utf-8

import os
import errno
import pickle


VERSION = '0.3.6'
# 获取项目根目录
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# 使用youdao目录下的data
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')   # 用户数据根目录
VOICE_DIR = os.path.join(BASE_DIR, 'voice')     # 音频文件

DATABASE = 'youdao.db'
PK_FILE = 'youdao.pk'
DB_DIR = os.path.join(BASE_DIR, DATABASE)
PK_DIR = os.path.join(BASE_DIR, PK_FILE)

config = {'version': '0'}


def silent_remove(filename):
    try:
        os.remove(filename)
    except OSError as e:
        if e.errno != errno.ENOENT:
            raise


def save_config():
    with open(PK_DIR, 'wb') as f:
        pickle.dump(config, f)


def update():
    # 从0.2.0开始更改了数据库
    # 重新设置数据库
    if config.get('version', '0') < '0.2.0':
        # silent_remove(DB_DIR)
        from youdao.model import db, Word
        try:
            db.drop_table(Word, fail_silently=True)
        except AttributeError:
            pass
        Word.create_table()


def prepare():
    if not os.path.exists(BASE_DIR):
        os.mkdir(BASE_DIR)
    if not os.path.exists(VOICE_DIR):
        os.mkdir(VOICE_DIR)

    if os.path.isfile(PK_DIR):
        with open(PK_DIR, 'rb') as f:
            global config
            config = pickle.load(f)
    # update
    update()
    if config.get('version', '0') < VERSION:
        config['version'] = VERSION
        save_config()


def set_dict_path(path):
    config['stardict'] = path
    save_config()
