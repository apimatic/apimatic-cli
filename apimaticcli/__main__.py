import sys

if __package__ is None and not hasattr(sys, 'frozen'):
    import os.path
    path = os.path.realpath(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(os.path.dirname(path)))

import argparse
import apimaticcli
from .argument_adder import ArgumentAdder

def main(args=None):
    
    if args is None:
        args = sys.argv[1:]

    parser = argparse.ArgumentParser(
        description='A utility for generating SDKs and validating or transforming API definitions.')

    subparsers = parser.add_subparsers(dest='command')
    subparsers.required = True

    gen_parser = subparsers.add_parser('generate', help='Generate an SDK.')
    gen_subparsers = gen_parser.add_subparsers(dest='auth')
    gen_subparsers.required = True

    genfromkey_parser = gen_subparsers.add_parser('fromkey', help='Generate an SDK using an API key.')
    ArgumentAdder.add_arguments(genfromkey_parser, '--api-key', '--platform', '--output')
    genfromkey_parser.set_defaults(func=apimaticcli.SDKGenerator.from_key)

    genfromurl_parser = gen_subparsers.add_parser('fromuser', help='Generate an SDK using user account credentials.')
    ArgumentAdder.add_auth(genfromurl_parser)
    ArgumentAdder.add_argument(genfromurl_parser, '--name')
    ArgumentAdder.add_input(genfromurl_parser)
    ArgumentAdder.add_arguments(genfromurl_parser, '--platform', '--output')
    genfromurl_parser.set_defaults(func=apimaticcli.SDKGenerator.from_user)

    args = parser.parse_args(args)
    args.func(args)

if __name__ == "__main__":
    main() 