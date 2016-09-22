import os
import mock
import time
import unittest

from helper import *
from apimaticcli.api_validator import *

class TestAPIValidator(unittest.TestCase):
    def test_validate_from_key(self):
        arguments = Helper.get_namespace()
        arguments.api_key = os.environ['APIMATIC_ERROR_KEY']

        with mock.patch('apimaticcli.api_validator.APIValidator.process_summary') as p_sum:
            APIValidator.from_key(arguments)
            args, kwargs = p_sum.call_args
            self.assertTrue(isinstance(args[0], ValidationSummary))
            self.assertEqual(args[0].success, False)
            self.assertGreater(len(args[0].errors), 0)

    def test_from_user_url(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.url = 'https://raw.githubusercontent.com/DudeSolutions/DudeReportApi/4e4a9feee81be01dd61b4eedc7eaf93e2a92d0b4/apiary.apib'

        with mock.patch('apimaticcli.api_validator.APIValidator.process_summary') as p_sum:
            APIValidator.from_user(arguments)
            args, kwargs = p_sum.call_args
            self.assertTrue(isinstance(args[0], ValidationSummary))
            self.assertTrue(isinstance(args[0].success, bool))

    def test_from_user_file(self):
        arguments = Helper.get_namespace()
        arguments.email = os.environ['APIMATIC_EMAIL']
        arguments.password = os.environ['APIMATIC_PASSWORD']
        arguments.file = './tests/data/calculator.json'

        with mock.patch('apimaticcli.api_validator.APIValidator.process_summary') as p_sum:
            APIValidator.from_user(arguments)
            args, kwargs = p_sum.call_args
            self.assertTrue(isinstance(args[0], ValidationSummary))
            self.assertEqual(args[0].success, True)
            self.assertEqual(len(args[0].errors), 0)       

    def tearDown(self):
       time.sleep(2)