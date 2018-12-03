import os
import re
import sys
import zipfile
import cgi

from .utilities import Utilities
from .apimatic.configuration import Configuration
from .apimatic.apimatic_client import ApimaticClient
from .apimatic.exceptions.api_exception import APIException
from .http_response_catcher import HttpResponseCatcher

class SDKGenerator:
    code_gen = ApimaticClient().generator
    response_catcher = HttpResponseCatcher()
    code_gen.http_call_back =  response_catcher

    @classmethod
    def from_key(cls, args):
        try:
            sdk_path = cls.code_gen.generate_from_key(args.api_key, args.platform)
        except APIException as e:
            print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
            sys.exit(1)

        download_as = cls.get_file_name()
        if args.download_as != None:
            download_as = args.download_as
        cls.download_sdk(sdk_path, args.download_to, download_as, args.skip_unzip)

    @classmethod
    def from_user(cls, args):
        Configuration.authorization = Utilities.generate_auth_header(args)

        if args.url != None:
            try:
                content = cls.code_gen.generate_from_url(args.name, args.url, args.platform)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        elif args.file != None:
            try:
                with open(args.file, "rb") as file:
                    content = cls.code_gen.generate_from_file(args.name, file, args.platform)
            except IOError as e:
                print("\nUnable to open API description file: " + str(e))
                sys.exit(1)
            except APIException as e:
                print("\nUnable to generate SDK from API. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        else:
            raise ValueError('Either the URL or the FILE argument is required.')

        download_as = cls.get_file_name()
        if args.download_as != None:
            download_as = args.download_as
        cls.download_sdk(content, args.download_to, download_as, args.skip_unzip)

    @classmethod
    def download_sdk(cls, content, download_to, download_as, skip_unzip = False):
        output_path = os.path.abspath(download_to.rstrip('/'))
        base_download_url = re.match('^https?://[^/]+', Configuration.base_uri).group(0)
        if download_as != None and not download_as.endswith('.zip'):
            download_as = download_as + '.zip'
        try:
            file_name = Utilities.write_directory(output_path, download_as,content)
        except IOError as e:
            print("Unable to dowload SDK: " + str(e))
            sys.exit(1)
        downloaded_as = file_name
        if not skip_unzip:
            zip_file_path = os.path.join(output_path, file_name)
            sdk_folder_name = os.path.splitext(file_name)[0]
            downloaded_as = sdk_folder_name
            output_path = os.path.join(output_path, sdk_folder_name)
            with zipfile.ZipFile(zip_file_path, 'r') as zip_file:
                zip_file.extractall(output_path)
            os.remove(zip_file_path)
        print("\nSDK downloaded to: {} as {}".format(download_to, downloaded_as))

    @classmethod
    def get_file_name(cls):
        if cls.response_catcher != None:
            headers = cgi.parse_header(cls.response_catcher.response.headers['content-disposition'])[1]
            return headers['filename']


