import sys

if __package__ is None and not hasattr(sys, 'frozen'):
    import os.path
    path = os.path.realpath(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(os.path.dirname(path)))

import argparse
import apimaticcli

def main(args=None):
    
    if args is None:
        args = sys.argv[1:]

    platforms = ['cs_portable_net_lib', 
                 'java_eclipse_jre_lib',
                 'java_gradle_android_lib',
                 'objc_cocoa_touch_ios_lib',
                 'angular_javascript_lib',
                 'ruby_generic_lib',
                 'python_generic_lib',
                 'php_generic_lib',
                 'node_javascript_lib',
                 'go_generic_lib']

    parser = argparse.ArgumentParser(
        description='A utility for generating SDKs and validating or transforming API definitions.')

    subparsers = parser.add_subparsers(dest='command')
    subparsers.required = True

    gen_parser = subparsers.add_parser('generate', help='Generate an SDK.')
    gen_subparsers = gen_parser.add_subparsers(dest='auth')
    gen_subparsers.required = True

    genfromkey_parser = gen_subparsers.add_parser('fromkey', help='Generate an SDK using an API key.')
    genfromkey_parser.add_argument('--api-key', required=True, help='The key of the API from APIMatic.')
    genfromkey_parser.add_argument('--platform', required=True, choices=platforms,
                                   help='The platform for which the SDK needs to be generated. Options are: ' + ', '.join(platforms), 
                                   metavar='PLATFORM')
    genfromkey_parser.add_argument('--output', default='./SDKS', 
                                   help='The path of the folder in which the generated SDK will be downloaded.')
    genfromkey_parser.set_defaults(func=apimaticcli.SDKGenerator.from_key)

    genfromurl_parser = gen_subparsers.add_parser('fromuser', help='Generate an SDK using user account credentials.')
    genfromurl_parser.add_argument('--email', required=True, help='The email address used to log in on the APIMatic website.')
    genfromurl_parser.add_argument('--password', required=True, help='The password used to log in on the APIMatic website.')
    genfromurl_parser.add_argument('--name', required=True, help='The name of the SDK.')
    group = genfromurl_parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--url', help='The URL of the API description.')
    group.add_argument('--file', help='The path of the API description.')
    genfromurl_parser.add_argument('--platform', required=True, choices=platforms, 
                                   help='The platform for which the SDK needs to be generated. Options are: ' + ', '.join(platforms), 
                                   metavar='PLATFORM')
    genfromurl_parser.add_argument('--output', default='./SDKS',
                                   help='The path of the folder in which the generated SDK will be downloaded.')
    genfromurl_parser.set_defaults(func=apimaticcli.SDKGenerator.from_user)

    args = parser.parse_args(args)
    args.func(args)

if __name__ == "__main__":
    main() 