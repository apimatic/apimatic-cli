import os
import re
import sys

from .utilities import Utilities
from .apimaticlib.api_matic_client import *

class SDKGenerator:
    code_gen = APIMaticClient().generator

    @classmethod
    def from_key(cls, args):
        try:     
            sdk_path = cls.code_gen.generate_from_key(args.api_key, args.platform)
        except APIException as e:
            print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
            sys.exit(1)

        cls.download_sdk(sdk_path, args.download_to)

    @classmethod
    def from_user(cls, args):
        Configuration.basic_auth_user_name = args.email
        Configuration.basic_auth_password = args.password

        if args.url != None:
            try:
                sdk_path = cls.code_gen.generate_from_url(args.name, args.url, args.platform)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        elif args.file != None:
            try:
                with open(args.file, "rb") as file:
                    sdk_path = cls.code_gen.generate_from_file(args.name, file, args.platform)
            except IOError as e:
                print("\nUnable to open API description file: " + str(e))
                sys.exit(1)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        else:
            raise ValueError('Either the URL or the FILE argument is required.')

        cls.download_sdk(sdk_path, args.download_to)

    @classmethod
    def download_sdk(cls, sdk_path, download_to):
        output_path = os.path.abspath(download_to.rstrip('/'))
        try:
            base_download_url = re.match('^https?://[^/]+', Configuration.BASE_URI).group(0)
            filename = Utilities.download_file(base_download_url + sdk_path, output_path)
            print("\nSDK downloaded to: {} as {}".format(download_to, filename))
        except IOError as e:
            print("Unable to dowload SDK: " + str(e))
            sys.exit(1)