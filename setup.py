from setuptools import setup, find_packages

setup(name='apimatic-cli',
      version='1.0',
      author='Shahid Khaliq',
      author_email='shahid.khaliq@apimatic.io',
      url='www.apimatic.io',
      packages=find_packages(),
      install_requires=['requests',
      					'jsonpickle'],
      test_requires=['nose'],
      test_suite = 'nose.collector',
      entry_points={
          'console_scripts': [
              'apimatic = apimaticcli.__main__:main'
          ]
      	}
      )