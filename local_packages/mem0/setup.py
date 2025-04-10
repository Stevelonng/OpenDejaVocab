from setuptools import setup, find_packages

setup(
    name="mem0",
    version="0.0.1",
    packages=find_packages(),
    install_requires=[
        "openai>=1.0.0",
        "litellm>=1.0.0",
        "qdrant-client>=1.3.0",
        "tiktoken>=0.4.0",
    ],
    python_requires='>=3.8',
)
