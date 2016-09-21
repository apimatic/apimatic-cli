import sys

if __package__ is None and not hasattr(sys, 'frozen'):
    import os.path
    path = os.path.realpath(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(os.path.dirname(path)))

import argparse
import apimaticcli as cli

def main(args=None):
    if args is None:
        args = sys.argv[1:]

    parser = argparse.ArgumentParser(
        description='A utility for generating SDKs and validating or transforming API definitions.')
    cli.ArgumentAdder.add_argument(parser, '--api')

    subparsers = parser.add_subparsers(dest='command')
    subparsers.required = True

    # Add generator parsers
    gen_parser = subparsers.add_parser('generate', help='Generate an SDK.')
    gen_subparsers = gen_parser.add_subparsers(dest='auth')
    gen_subparsers.required = True

    genfromkey_parser = gen_subparsers.add_parser('fromkey', help='Generate an SDK using an API key.')
    cli.ArgumentAdder.add_arguments(genfromkey_parser, '--api-key', '--platform', '--output')
    genfromkey_parser.set_defaults(func=cli.SDKGenerator.from_key)

    genfromurl_parser = gen_subparsers.add_parser('fromuser', help='Generate an SDK using user account credentials.')
    cli.ArgumentAdder.add_auth(genfromurl_parser)
    cli.ArgumentAdder.add_argument(genfromurl_parser, '--name')
    cli.ArgumentAdder.add_input(genfromurl_parser)
    cli.ArgumentAdder.add_arguments(genfromurl_parser, '--platform', '--output')
    genfromurl_parser.set_defaults(func=cli.SDKGenerator.from_user)

    # Add validation parsers
    val_parser = subparsers.add_parser('validate', help='Validate an API description.')
    val_subparsers = val_parser.add_subparsers(dest='auth')
    val_subparsers.required = True

    valfromkey_parser = val_subparsers.add_parser('fromkey', help='Validate an API description using an API key.')
    cli.ArgumentAdder.add_argument(valfromkey_parser, '--api-key')
    valfromkey_parser.set_defaults(func=cli.APIValidator.from_key)

    valfromurl_parser = val_subparsers.add_parser('fromuser', help='Validate an API description using user account credentials.')
    cli.ArgumentAdder.add_auth(valfromurl_parser)
    cli.ArgumentAdder.add_input(valfromurl_parser)
    valfromurl_parser.set_defaults(func=cli.APIValidator.from_user)

    # Parse arguments and call subparser function
    args = parser.parse_args(args)
    parse_global(args)
    args.func(args)

def parse_global(args):
    if hasattr(args, 'api') and args.api != None:
        cli.apimaticlib.Configuration.BASE_URI = args.api


if __name__ == "__main__":
    main() 