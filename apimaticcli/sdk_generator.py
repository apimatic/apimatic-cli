import os
import sys

from .apimaticlib import *
from .utilities import Utilities

class SDKGenerator:
    code_gen = APIMaticClient().generator
    base_url = 'https://apimatic.io/'

    @classmethod
    def from_key(cls, args):
        try:     
            sdk_path = cls.code_gen.generate_from_key(args.api_key, args.platform)
        except APIException as e:
            print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
            sys.exit(1)

        cls.download_sdk(sdk_path, args.output)

    @classmethod
    def from_user(cls, args):
        Configuration.basic_auth_user_name = args.email
        Configuration.basic_auth_password = args.password

        if hasattr(args, 'url') and args.url != None:
            try:
                sdk_path = cls.code_gen.generate_from_url(args.name, args.platform, args.url)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        elif hasattr(args, 'file') and args.file != None:
            try:
                with open(args.file, "rb") as file:
                    sdk_path = cls.code_gen.generate_from_file(args.name, args.platform, file)
            except IOError as e:
                print("\nUnable to open API description file: " + str(e))
                sys.exit(1)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        else:
            raise ValueError('Either the URL or the FILE argument is required.')

        cls.download_sdk(sdk_path, args.output)

    @classmethod
    def download_sdk(cls, sdk_path, output):
        output_path = os.path.abspath(output.rstrip('/'))
        try:
            filename = Utilities.download_file(cls.base_url + sdk_path, output_path)
            print("\nSDK downloaded to: {} as {}".format(output, filename))
        except Exception as e:
            print("Unable to dowload SDK: " + str(e))
            sys.exit(1)