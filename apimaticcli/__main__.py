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
    cli.ArgumentAdder.add_arguments(genfromkey_parser, '--api-key', '--platform', '--download-to')
    genfromkey_parser.set_defaults(func=cli.SDKGenerator.from_key)

    genfromuser_parser = gen_subparsers.add_parser('fromuser', help='Generate an SDK using user account credentials.')
    cli.ArgumentAdder.add_auth(genfromuser_parser)
    cli.ArgumentAdder.add_argument(genfromuser_parser, '--name')
    cli.ArgumentAdder.add_input(genfromuser_parser)
    cli.ArgumentAdder.add_arguments(genfromuser_parser, '--platform', '--download-to')
    genfromuser_parser.set_defaults(func=cli.SDKGenerator.from_user)

    # Add validation parsers
    val_parser = subparsers.add_parser('validate', help='Validate an API description.')
    val_subparsers = val_parser.add_subparsers(dest='auth')
    val_subparsers.required = True

    valfromkey_parser = val_subparsers.add_parser('fromkey', help='Validate an API description using an API key.')
    cli.ArgumentAdder.add_argument(valfromkey_parser, '--api-key')
    valfromkey_parser.set_defaults(func=cli.APIValidator.from_key)

    valfromuser_parser = val_subparsers.add_parser('fromuser', help='Validate an API description using user account credentials.')
    cli.ArgumentAdder.add_auth(valfromuser_parser)
    cli.ArgumentAdder.add_input(valfromuser_parser)
    valfromuser_parser.set_defaults(func=cli.APIValidator.from_user)

    # Add transformation parsers
    tra_parser = subparsers.add_parser('transform', help='Transform an API description.')
    tra_subparsers = tra_parser.add_subparsers(dest='auth')
    tra_subparsers.required = True

    trafromkey_parser = tra_subparsers.add_parser('fromkey', help='Transform an API description using an API key.')
    cli.ArgumentAdder.add_arguments(trafromkey_parser, '--api-key', '--format', '--download-to', '--save-as')
    trafromkey_parser.set_defaults(func=cli.APITransformer.from_key)

    trafromuser_parser = tra_subparsers.add_parser('fromuser', help='Transform an API description using user account credentials.')
    cli.ArgumentAdder.add_auth(trafromuser_parser)
    cli.ArgumentAdder.add_input(trafromuser_parser)
    cli.ArgumentAdder.add_arguments(trafromuser_parser, '--format', '--download-to', '--save-as')
    trafromuser_parser.set_defaults(func=cli.APITransformer.from_user)

    # Parse arguments and call subparser function
    args = parser.parse_args(args)
    parse_global(args)
    args.func(args)

def parse_global(args):
    if args.api != None:
        cli.apimaticlib.Configuration.BASE_URI = args.api


if __name__ == "__main__":
    main() 