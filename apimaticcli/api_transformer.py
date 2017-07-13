import os
import sys

from .utilities import Utilities
from .apimatic.configuration import Configuration
from .apimatic.apimatic_client import ApimaticClient
from .apimatic.exceptions.api_exception import APIException

class APITransformer:
    api_transformer = ApimaticClient().transformer

    extensions = {
        'APIBluePrint': 'apib',
        'Swagger10': 'json',
        'Swagger20': 'json',
        'SwaggerYaml': 'yaml',
        'WADL2009': 'wadl',
        'RAML': 'raml',
        'APIMATIC': 'json'
    }

    @classmethod
    def from_key(cls, args):
        try:
            response = cls.api_transformer.transform_from_key(args.api_key, args.format)
        except APIException as e:
            print("\nUnable to transform API description. HTTP response code: " + str(e.response_code))
            sys.exit(1)

        cls.save_description(response, args)

    @classmethod
    def from_user(cls, args):
        Configuration.authorization = Utilities.generate_auth_header(args)

        if args.url != None:
            try:
                response = cls.api_transformer.transform_from_url(args.url, args.format)
            except APIException as e:
                print("\nUnable to transform API description. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        elif args.file != None:
            try:
                with open(args.file, "rb") as file:
                    response = cls.api_transformer.transform_from_file(file, args.format)
            except IOError as e:
                print("\nUnable to open API description file: " + str(e))
                sys.exit(1)
            except APIException as e:
                print("\nUnable to transform API description. HTTP response code: " + str(e.response_code))
                sys.exit(1)
        else:
            raise ValueError('Either the URL or the FILE argument is required.')

        cls.save_description(response, args)

    @classmethod
    def save_description(cls, response, args):
        output_path = os.path.abspath(args.download_to.rstrip('/'))
        file_name = args.download_as or ('converted.' + cls.extensions[args.format])
        try:
            Utilities.create_directories(output_path)
            Utilities.write_file(output_path, file_name, response.encode('utf-8'))
            print("\nConverted API description saved to: {} as {}".format(output_path, file_name))
        except IOError as e:
            print("Unable to transform API description: " + str(e))
            sys.exit(1)
