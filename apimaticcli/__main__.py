import sys
from .argument_parser import ArgumentParser
from .apimatic.configuration import Configuration

def main(args=None):
    if args is None:
        args = sys.argv[1:]

    arguments = ArgumentParser.parse(args)

    # Configure SDK
    if arguments.api != None:
        Configuration.base_uri = arguments.api

    # Call the appropriate subparser function
    arguments.func(arguments)

if __name__ == "__main__":
    main()
