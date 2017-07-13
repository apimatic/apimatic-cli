import os
import time
import unittest

from helper import Helper
from apimaticcli.api_transformer import APITransformer
from apimaticcli.argument_parser import ArgumentParser

class TestAPITransformer(unittest.TestCase):
    output_path = './Converted'

    def setUp(self):
        Helper.delete_folder(TestAPITransformer.output_path)

    def test_from_key_with_name(self):
        args = [
            'transform', 'fromapikey',
            '--api-key', os.environ['APIMATIC_KEY'],
            '--format', 'WADL2009',
            '--download-to', TestAPITransformer.output_path,
            '--download-as', "test.wadl"
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_key(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], arguments.download_as)
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_key_no_name(self):
        args = [
            'transform', 'fromapikey',
            '--api-key', os.environ['APIMATIC_KEY'],
            '--format', 'SwaggerYaml',
            '--download-to', TestAPITransformer.output_path
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_key(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.yaml")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_url(self):
        args = [
            'transform', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--url', 'https://raw.githubusercontent.com/DudeSolutions/CoreApi/master/apiary.apib',
            '--format', 'APIMATIC',
            '--download-to', TestAPITransformer.output_path,
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_user(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.json")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_file(self):
        args = [
            'transform', 'fromuser',
            '--email', os.environ['APIMATIC_EMAIL'],
            '--password', os.environ['APIMATIC_PASSWORD'],
            '--file', './tests/data/calculator.json',
            '--format', 'APIBluePrint',
            '--download-to', TestAPITransformer.output_path,
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_user(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.apib")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_auth_url(self):
        args = [
            'transform', 'fromauthkey',
            '--auth-key', os.environ['APIMATIC_AUTH_KEY'],
            '--url', 'https://raw.githubusercontent.com/DudeSolutions/CoreApi/master/apiary.apib',
            '--format', 'APIMATIC',
            '--download-to', TestAPITransformer.output_path,
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_user(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.json")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_auth_file(self):
        args = [
            'transform', 'fromauthkey',
            '--auth-key', os.environ['APIMATIC_AUTH_KEY'],
            '--file', './tests/data/calculator.json',
            '--format', 'APIBluePrint',
            '--download-to', TestAPITransformer.output_path,
        ]
        arguments = ArgumentParser.parse(args)
        APITransformer.from_user(arguments)
        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.apib")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def tearDown(self):
        time.sleep(2)
        Helper.delete_folder(TestAPITransformer.output_path)
