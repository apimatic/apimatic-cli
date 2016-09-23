import sys

from .apimaticlib.api_matic_client import *

class APIValidator:
    api_validator = APIMaticClient().validator

    @classmethod
    def from_key(cls, args):
        try:
            summary = cls.api_validator.validate_from_key(args.api_key)
        except APIException as e:
            print("\nUnable to validatate API description. HTTP response code: " + str(e.response_code))
            sys.exit(1)

        cls.process_summary(summary)

    @classmethod
    def from_user(cls, args):
        Configuration.basic_auth_user_name = args.email
        Configuration.basic_auth_password = args.password

        if args.url != None:
            try:
                summary = cls.api_validator.validate_from_url(args.url)
            except APIException as e:
                print("\nUnable to validatate API description. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        elif args.file != None:
            try:
                with open(args.file, "rb") as file:
                    summary = cls.api_validator.validate_from_file(file)
            except IOError as e:
                print("\nUnable to open API description file: " + str(e))
                sys.exit(1)
            except APIException as e:
                print("\nUnable to validatate API description. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        else:
            raise ValueError('Either the URL or the FILE argument is required.')

        cls.process_summary(summary)

    @classmethod
    def process_summary(cls, summary):
        try:
            print("\nSummary details: {} error(s), {} warning(s) and {} information message(s).\n".
                format(str(len(summary.errors)), str(len(summary.warnings)), str(len(summary.messages))))
            for error in summary.errors:
                print("Validation error: {}".format(error))
            for warning in summary.warnings:
                print("Validation warning: {}".format(warning))
            for message in summary.messages:
                print("Validation message: {}".format(message))
            if summary.success != True:
                sys.exit(1)
        except Exception as e:
            print("\nUnable to process summary: " + str(e))
            sys.exit(1)

