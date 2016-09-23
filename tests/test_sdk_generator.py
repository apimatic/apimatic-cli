import time
import unittest

from helper import *
from apimaticcli.sdk_generator import *

class TestSDKGenerator(unittest.TestCase):
    output_path = './SDKs'

    def setUp(self):
        Helper.delete_folder(TestSDKGenerator.output_path)

    def test_from_key(self):
        arguments = Helper.get_namespace()
        arguments.api_key = os.environ['APIMATIC_KEY']
        arguments.platform = 'cs_portable_net_lib'
        arguments.download_to = TestSDKGenerator.output_path

        SDKGenerator.from_key(arguments)

        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_url(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.name = 'Duuuudes'
        arguments.platform = 'cs_portable_net_lib'
        arguments.download_to = TestSDKGenerator.output_path
        arguments.url = 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib'

        SDKGenerator.from_user(arguments)

        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_file(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.name = 'Calculator'
        arguments.platform = 'cs_portable_net_lib'
        arguments.download_to = TestSDKGenerator.output_path
        arguments.file = './tests/data/calculator.json'

        SDKGenerator.from_user(arguments)

        files = os.listdir(TestSDKGenerator.output_path)
        self.assertEqual(len(files), 1)
        self.assertTrue(files[0].endswith(".zip"))
        file_size = os.stat(os.path.join(TestSDKGenerator.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)        

    def tearDown(self):
        time.sleep(2)
        Helper.delete_folder(TestSDKGenerator.output_path)
