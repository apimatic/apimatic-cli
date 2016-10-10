import os
import time
import unittest

from helper import Helper
from apimaticcli.sdk_generator import SDKGenerator
from apimaticcli.argument_parser import ArgumentParser

class TestSDKGenerator(unittest.TestCase):
    output_path = './SDKs'

    def setUp(self):
        Helper.delete_folder(TestSDKGenerator.output_path)

    def test_from_key_renamed_zipped(self):
        name = 'CSharp.zip'
        args = [
            'generate', 'fromkey',
            '--api-key', os.environ['APIMATIC_KEY'],
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path,
            '--download-as', name,
            '--skip-unzip'
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_key(arguments)
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], name)
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_key_unzipped(self):
        args = [
            'generate', 'fromkey',
            '--api-key', os.environ['APIMATIC_KEY'],
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_key(arguments)
        directories = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(directories), 1)
        sdk_folder_path = os.path.join(TestSDKGenerator.output_path, directories[0])
        sdk_files = os.listdir(sdk_folder_path)
        self.assertGreater(len(sdk_files), 1)

    def test_from_user_url_zipped(self):
        args = [
            'generate', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--name', 'Duuuudes',
            '--url', 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib',
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path,
            '--skip-unzip'
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_user(arguments)
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_url_renamed_unzipped(self):
        name = 'Duuuuuuudes'
        args = [
            'generate', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--name', 'Duuuudes',
            '--url', 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib',
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path,
            '--download-as', name
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_user(arguments)
        directories = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(directories), 1)
        self.assertEqual(directories[0], name)
        sdk_folder_path = os.path.join(TestSDKGenerator.output_path, directories[0])
        sdk_files = os.listdir(sdk_folder_path)
        self.assertGreater(len(sdk_files), 1)

    def test_from_user_file_renamed_zipped(self):
        name = 'CSharpCalcy'
        args = [
            'generate', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--name', 'Duuuudes',
            '--file', './tests/data/calculator.json',
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path,
            '--download-as', name,
            '--skip-unzip'
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_user(arguments)
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], name + '.zip')
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_file_unzipped(self):
        args = [
            'generate', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--name', 'Duuuudes',
            '--file', './tests/data/calculator.json',
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_user(arguments)
        directories = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(directories), 1)
        sdk_folder_path = os.path.join(TestSDKGenerator.output_path, directories[0])
        sdk_files = os.listdir(sdk_folder_path)
        self.assertGreater(len(sdk_files), 1)

    def tearDown(self):
        time.sleep(2)
        Helper.delete_folder(TestSDKGenerator.output_path)
