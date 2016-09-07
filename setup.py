from setuptools import setup, find_packages

setup(
    name='apimatic-cli',
    version='1.0',
    author='Shahid Khaliq',
    author_email='shahid.khaliq@apimatic.io',
    url='www.apimatic.io',
    packages=find_packages(),
    install_requires=[
        'requests>=2.9.1, <3.0',
        'jsonpickle>=0.7.1, <1.0'
    ],
    tests_require=[
        'nose>=1.3.7',
        'mock>=2.0.0'
    ],
    test_suite = 'nose.collector',
    entry_points={
        'console_scripts': [
            'apimatic = apimaticcli.__main__:main'
        ]
    }
)