FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm

# Copy project files
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs

# 正确安装mem0包
RUN echo "=============== 检查mem0包结构 ==============="
RUN ls -la /app/local_packages/
WORKDIR /app/local_packages/mem0
RUN ls -la 
RUN find . -name "__init__.py" | sort

# 确保以可编辑模式安装，但先删除之前的安装
RUN pip uninstall -y mem0 || true

# 安装mem0的依赖包
RUN pip install posthog pytz

# 预装可能需要的其他常用依赖包
RUN pip install pydantic pandas SQLAlchemy python-dateutil tzlocal numpy matplotlib

# 安装mem0
RUN pip install -e .

# 验证安装
RUN pip list | grep mem0

# 重要：将整个local_packages目录添加到PYTHONPATH
ENV PYTHONPATH="/app/local_packages"

# 测试导入
RUN python -c "import sys; print('\nPython 搜索路径:'); [print(p) for p in sys.path]; print('\n尝试导入mem0:'); import mem0; print('mem0导入成功'); print('Memory类位置:', mem0.Memory); from mem0 import Memory; print('Memory导入成功')"

# 创建一个启动前检查脚本
RUN echo '#!/bin/bash\n\necho "===== 检查mem0导入 ====="\npython -c "import mem0; print(\"mem0 is available\")" || echo "ERROR: mem0 not available"' > /app/check_mem0.sh
RUN chmod +x /app/check_mem0.sh

# Expose port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV QDRANT_URL=http://qdrant:6333

# Switch working directory to backend folder
WORKDIR /app/backend

# Set health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/ || exit 1

# Startup command，增加超时时间设置
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "subtitle_collector.wsgi", "--workers", "4", "--timeout", "120", "--keep-alive", "65"]

# 在文件末尾添加标签
LABEL maintainer="tcytcy111@gmail.com"
LABEL version="1.0.0"
LABEL description="OpenDejaVocab backend service"
