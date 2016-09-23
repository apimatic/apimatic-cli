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

    def test_from_key(self):
        args = [
            'generate', 'fromkey',
            '--api-key', os.environ['APIMATIC_KEY'],
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_key(arguments)
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_url(self):
        args = [
            'generate', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--name', 'Duuuudes',
            '--url', 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib',
            '--platform', 'cs_portable_net_lib',
            '--download-to', TestSDKGenerator.output_path
        ]
        arguments = ArgumentParser.parse(args)
        SDKGenerator.from_user(arguments)
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_file(self):
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
        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)        

    def tearDown(self):
        time.sleep(2)
        Helper.delete_folder(TestSDKGenerator.output_path)
