import os
import cgi
import requests

class Utilities:
    """A class for utility functions."""

    @classmethod
    def download_file(cls, url, output_path, file_name = None):
        """Downloads a file.

        Given a URL and an output path, downloads the file 
        from the URL and saves it in the provided path. It 
        also extracts the file name from the headers and
        saves the file with that name.
 
        Args:
            url: The URL of the file to download.
            outpath_path: The path of the folder where to save 
                the file.
            file_name: The name of the downloaded file.

        Returns:
            The file name of the downloaded file.
        """
        response = requests.get(url)
        if file_name == None:
            headers = cgi.parse_header(response.headers['content-disposition'])[1]
            file_name = headers['filename']
        cls.create_directories(output_path)
        cls.write_file(output_path, file_name, response.content)
        return file_name

    @classmethod
    def write_file(cls, path, name, content):
        """Writes a file.

        Give an output path, a file name and content data,
        this functions writes a file in wb mode.

        Args:
            path: The path of the folder in which to create
                the file.
            name: The name of the file to create.
            content: The data to write into the file.
        """
        with open(os.path.join(path, name), 'wb') as f:
            f.write(content)

    @classmethod
    def create_directories(cls, path):
        """Creates directories.

        Checks if a path exists. Creates the required 
        directories if it doesn't.

        Args:
            path: The hierarchical path to check.
        """
        if not os.path.exists(path):
            try:
                os.makedirs(path)
            except OSError as exc:
                if exc.errno != errno.EEXIST:
                    raise