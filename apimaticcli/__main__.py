import sys

if __package__ is None and not hasattr(sys, 'frozen'):
    import os.path
    path = os.path.realpath(os.path.abspath(__file__))
    sys.path.insert(0, os.path.dirname(os.path.dirname(path)))

import apimaticcli as cli

def main(args=None):
    if args is None:
        args = sys.argv[1:]

    arguments = cli.ArgumentParser.parse(args)

    # Configure SDK
    if arguments.api != None:
        cli.apimaticlib.Configuration.BASE_URI = arguments.api

    # Call the appropriate subparser function
    arguments.func(arguments)


if __name__ == "__main__":
    main() 