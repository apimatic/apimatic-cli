import argparse

from .argument_adder import ArgumentAdder
from .sdk_generator import SDKGenerator
from .api_validator import APIValidator
from .api_transformer import APITransformer

class ArgumentParser:
    """Class which contains functions for argument parsing."""
    @classmethod
    def parse(cls, arguments):
        """ Parses command line arguments.

        Args:
            arguments: A list of command line arguments.
        Returns:
            An argparse namespace object.
        """
        parser = argparse.ArgumentParser(
        description='A utility for generating SDKs and validating or transforming API definitions.')
        ArgumentAdder.add_argument(parser, '--api')

        subparsers = parser.add_subparsers(dest='command')
        subparsers.required = True

        # Add generator parsers
        gen_parser = subparsers.add_parser('generate', help='Generate an SDK.')
        gen_subparsers = gen_parser.add_subparsers(dest='auth')
        gen_subparsers.required = True

        genfromkey_parser = gen_subparsers.add_parser('fromapikey', help='Generate an SDK using an API key.')
        ArgumentAdder.add_arguments(genfromkey_parser, '--api-key', '--platform', '--download-to', '--download-as', '--skip-unzip')
        genfromkey_parser.set_defaults(func=SDKGenerator.from_key)

        genfromuser_parser = gen_subparsers.add_parser('fromuser', help='Generate an SDK using user account credentials.')
        ArgumentAdder.add_auth(genfromuser_parser)
        ArgumentAdder.add_argument(genfromuser_parser, '--name')
        ArgumentAdder.add_input(genfromuser_parser)
        ArgumentAdder.add_arguments(genfromuser_parser, '--platform', '--download-to', '--download-as', '--skip-unzip')
        genfromuser_parser.set_defaults(func=SDKGenerator.from_user)

        genfromauth_parser = gen_subparsers.add_parser('fromauthkey', help='Generate an SDK using user authentication key.')
        ArgumentAdder.add_argument(genfromauth_parser, '--auth-key')
        ArgumentAdder.add_argument(genfromauth_parser, '--name')
        ArgumentAdder.add_input(genfromauth_parser)
        ArgumentAdder.add_arguments(genfromauth_parser, '--platform', '--download-to', '--download-as', '--skip-unzip')
        genfromauth_parser.set_defaults(func=SDKGenerator.from_user)

        # Add validation parsers
        val_parser = subparsers.add_parser('validate', help='Validate an API description.')
        val_subparsers = val_parser.add_subparsers(dest='auth')
        val_subparsers.required = True

        valfromkey_parser = val_subparsers.add_parser('fromapikey', help='Validate an API description using an API key.')
        ArgumentAdder.add_argument(valfromkey_parser, '--api-key')
        valfromkey_parser.set_defaults(func=APIValidator.from_key)

        valfromuser_parser = val_subparsers.add_parser('fromuser', help='Validate an API description using user account credentials.')
        ArgumentAdder.add_auth(valfromuser_parser)
        ArgumentAdder.add_input(valfromuser_parser)
        valfromuser_parser.set_defaults(func=APIValidator.from_user)

        valfromauth_parser = val_subparsers.add_parser('fromauthkey', help='Validate an API description using user authentication key.')
        ArgumentAdder.add_argument(valfromauth_parser, '--auth-key')
        ArgumentAdder.add_input(valfromauth_parser)
        valfromauth_parser.set_defaults(func=APIValidator.from_user)

        # Add transformation parsers
        tra_parser = subparsers.add_parser('transform', help='Transform an API description.')
        tra_subparsers = tra_parser.add_subparsers(dest='auth')
        tra_subparsers.required = True

        trafromkey_parser = tra_subparsers.add_parser('fromapikey', help='Transform an API description using an API key.')
        ArgumentAdder.add_arguments(trafromkey_parser, '--api-key', '--format', '--download-to', '--download-as')
        trafromkey_parser.set_defaults(func=APITransformer.from_key)

        trafromuser_parser = tra_subparsers.add_parser('fromuser', help='Transform an API description using user account credentials.')
        ArgumentAdder.add_auth(trafromuser_parser)
        ArgumentAdder.add_input(trafromuser_parser)
        ArgumentAdder.add_arguments(trafromuser_parser, '--format', '--download-to', '--download-as')
        trafromuser_parser.set_defaults(func=APITransformer.from_user)

        transformfromauth_parser = tra_subparsers.add_parser('fromauthkey', help='Transform an API description using user authentication key.')
        ArgumentAdder.add_argument(transformfromauth_parser, '--auth-key')
        ArgumentAdder.add_input(transformfromauth_parser)
        ArgumentAdder.add_arguments(transformfromauth_parser, '--format', '--download-to', '--download-as')
        transformfromauth_parser.set_defaults(func=APITransformer.from_user)

        # Parse arguments and and return argparse namespace
        return parser.parse_args(arguments)
