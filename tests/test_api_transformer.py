import time
import unittest

from helper import *
from apimaticcli.api_transformer import *

class TestAPITransformer(unittest.TestCase):
    output_path = './Converted'

    def setUp(self):
        Helper.delete_folder(TestAPITransformer.output_path)

    def test_from_key_with_name(self):
        arguments = Helper.get_namespace()
        arguments.api_key = os.environ['APIMATIC_KEY']
        arguments.format = 'WADL2009'
        arguments.download_to = TestAPITransformer.output_path
        arguments.download_as = "test.wadl"

        APITransformer.from_key(arguments)

        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], arguments.download_as)
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_key_no_name(self):
        arguments = Helper.get_namespace()
        arguments.api_key = os.environ['APIMATIC_KEY']
        arguments.format = 'SwaggerYaml'
        arguments.download_to = TestAPITransformer.output_path

        APITransformer.from_key(arguments)

        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.yaml")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    @unittest.skip("Waiting on CGAAS team to change URL parameter name.")
    def test_from_user_url(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.format = 'APIMATIC'
        arguments.download_to = TestAPITransformer.output_path
        arguments.url = 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib'

        APITransformer.from_user(arguments)

        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.json")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def test_from_user_file(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.format = 'APIBluePrint'
        arguments.download_to = TestAPITransformer.output_path
        arguments.file = './tests/data/calculator.json'

        APITransformer.from_user(arguments)

        files = os.listdir(TestAPITransformer.output_path)
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0], "converted.apib")
        file_size = os.stat(os.path.join(TestAPITransformer.output_path, files[0])).st_size
        self.assertGreater(file_size, 0)

    def tearDown(self):
        time.sleep(2)
        Helper.delete_folder(TestAPITransformer.output_path)
