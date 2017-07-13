import shutil
import unittest
from apimaticcli.utilities import *

class TestUtilities(unittest.TestCase):
    def setUp(self):
        if os.path.exists('./temp'):
            shutil.rmtree('./temp')

    @unittest.skip("Needs a different URL.")
    def test_download_file(self):
        url = 'https://dl.dropboxusercontent.com/u/31838656/binary.png'
        output_path = os.path.abspath('./temp/SDK')
        Utilities.download_file(url, output_path)
        downloaded = os.path.join(output_path, 'binary.png')
        with open(downloaded, "rb") as file:
            content = file.read()
            self.assertEqual(13504, len(content));
            self.assertEqual("PNG", content[1:4].decode('ascii'))

    def test_create_directories(self):
        file_path = os.path.abspath('./temp/files/apimatic')
        Utilities.create_directories(file_path)
        self.assertTrue(os.path.exists(os.path.abspath('./temp/files/apimatic')))

    def tearDown(self):
        if os.path.exists('./temp'):
            shutil.rmtree('./temp')
