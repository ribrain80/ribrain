/**
 * Available options:
 *
 * --env: string - deployment target - Default: staging
 * --branch: string - git branch to be deployed - Default: master
 * --debug: boolean - console logging -  Default: true
 * --nodry: boolean - dryrun or actual rsync - Default: false
 * --author: string - add deployment author
 *
 * @author Riccardo Brambilla
 * @date: 2016-01-22
 */

// # Require nodejs libs
var os = require( 'os' );
var del = require( 'del' );
var fs = require( 'fs' );

// # Require gulp and all the pugins needed 
var gulp = require( 'gulp' );
var gulpif = require( 'gulp-if' );
var uglify = require( 'gulp-uglify' );
var concat = require( 'gulp-concat' );
var minify = require( 'gulp-minify-css' );
var minimist = require( 'minimist' );
var rsync = require( 'gulp-rsync' );
var git = require( 'gulp-git' );
var rename = require( 'gulp-rename' );
var sass = require( 'gulp-sass' );
var htmlhint = require( "gulp-htmlhint" );
var markdown = require( 'gulp-markdown' );
var browserify = require('browserify');

// # Exec capability
var exec = require( 'child_process' ).exec;

// # Sets the current env and sets the main variables
gulp.task( 'config', function ( cb ) {

    // # hostname check
    var hostname = os.hostname();

    // # FIXME, will be TRLIVEBUILDER ( the bridge server )
    if ( hostname != 'riccardo-Latitude-E6430' ) {
        console.log( "NON SEI SULLA MACCHINA PONTE!\nhostname = " + hostname );
        process.exit();
    }

    // # get options from the command line
    var options = minimist( process.argv.slice( 2 ) );

    // # default env is staging
    env = undefined == options.env ? 'staging' : options.env;

    // # default branch is master
    branch = undefined == options.branch ? 'master' : options.branch;

    // # author
    author = undefined == options.author ? 'unknown' : options.author;

    // # No way
    if ( env == 'production' && branch != 'master' ) {
        console.log( "NON PUOI DEPLOYARE IN PRODUZIONE DA QUESTO BRANCH!\nenv = " + env + "\nbranch = " + branch );
        process.exit();
    }

    // # default is debug enabled
    debug = undefined == options.debug ? false : true;

    // # default is a dryrun
    nodry = undefined == options.nodry ? false : true;

    // # setting rsync paths, env-based
    switch ( env ) {

    case 'production':
        path = '/home/riccardo/projects/ge-remote-production/';
        break;

    default:
    case 'staging':
        path = '/home/riccardo/projects/ge-remote/';
        break;
    }


    // # LARAVEL .env management

    /*
  
    // Copy .env settings for dev deployment
    fs.createReadStream('.env.staging').pipe( fs.createWriteStream('.env') );

    if( env == "production" ) {
      branch = 'master';
      path = '/home/cdf/gitProjects/deploy/prod/';
      fs.createReadStream('.env.prod').pipe( fs.createWriteStream('.env') );
    }

    */

    // # Some debug options to show
    if ( debug ) {
        console.log( "Task config: hostname = " + hostname );
        console.log( "Task config: env = " + env );
        console.log( "Task config: branch = " + branch );
        console.log( "Task config: path = " + path );
        console.log( "Task config: nodry = " + nodry );
        console.log( "Task config: author = " + author );
    }

    cb();

} );

// # GIT Remove untracked files
gulp.task( 'git-clean', [ 'config' ], function ( cb ) {

    git.clean( {
        args: '-fd'
    }, function ( err ) {

        if ( debug ) {
            // # git clean console
            console.log( "Task git: clean - untracked files removed" );
        }

        cb( err );
    } );

} );

// # GIT Reset HEAD
gulp.task( 'git-reset', [ 'git-clean' ], function ( cb ) {

    if ( debug ) {
        console.log( "Task git: branch = " + branch );
    }

    // # reset HEAD, all the changes made on the deployment server will be erased
    // # this will ensure the local repository is aligned to the last commit
    git.reset( "HEAD", {
        args: "--hard"
    }, function ( err ) {

        if ( debug ) {
            // # Reset hard - CHECKME
            console.log( "Task git: reset HEAD --hard completed, repository is cleaned" );
        }

        cb( err );

    } );

} );

// # GIT Checkout branch
gulp.task( 'git-checkout', [ 'git-reset' ], function ( cb ) {

    // # checkout
    git.checkout( branch, {}, function ( err ) {

        if ( debug ) {
            console.log( "Checked out branch = " + branch );
        }

        cb( err );
    } );

} );

// # GIT Pull origin
gulp.task( 'git-pull', [ 'git-checkout' ], function ( cb ) {

    // # actually pull the remote branch
    return git.pull( 'origin', branch, {}, function ( err ) {

        if ( debug ) {
            console.log( "Pulled branch = " + branch );
        }

        cb( err );

    } );

} );

// # Clean the css and js dist folder
// # Depends on check
gulp.task( 'clean', [ 'git-pull' ], function () {
    return del( [ 'assets/dest/sass/*', 'assets/dest/css/*', 'assets/dest/js/*' ] );
} );

// # HTMLHint task, check html 
// # Depends on clean
// # Reports error but does not fail
gulp.task( 'htmlhint', [ 'clean' ], function () {

    if ( debug ) {
        console.log( "Task htmlhint: env = " + env );
    }

    return gulp.src( "index.html" )
        .pipe( htmlhint() )
        .pipe( htmlhint.reporter() );
} );

// # Compile the css from sass
// # Depends on clean
gulp.task( 'sass', [ 'clean' ], function () {

    if ( debug ) {
        console.log( "Task sass: env = " + env );
    }

    return gulp.src( 'assets/source/sass/**/*.scss' )
        .pipe( sass( {
            outputStyle: 'compressed'
        } ).on( 'error', sass.logError ) )
        .pipe( gulp.dest( 'assets/dest/css' ) );
} );

// # Minify all css and copy them to dist folder
// # Depends on sass
gulp.task( 'cssmin', [ 'sass' ], function () {

    if ( debug ) {
        console.log( "Task cssmin: env = " + env );
    }

    // # Aggiungere prefix
    // # Only minify and rename in production env
    return gulp.src( 'assets/source/css/*.css' )
        .pipe( gulpif( env == "production", minify() ) )
        .pipe( gulpif( env == "production", rename( function ( path ) {
            path.dirname += "";
            path.basename += ".min";
            path.extname = ".css";
        } ) ) )
        .pipe( gulp.dest( 'assets/dest/css/' ) );
} );

// Uglify all js and copy them to dist folder
// Depends on clean
gulp.task( 'jsmin', [ 'clean' ], function () {

    if ( debug ) {
        console.log( "Task jsmin: env = " + env );
    }

    // Aggiungere prefix
    // Only concat and uglify in production env
    return gulp.src( 'assets/source/js/*.js' )
        .pipe( gulpif( env == "production", uglify() ) )
        .pipe( gulpif( env == "production", rename( function ( path ) {
            path.dirname += "";
            path.basename += ".min";
            path.extname = ".js";
        } ) ) )
        .pipe( gulp.dest( 'assets/dest/js/' ) );
} );

// # Concat some files
gulp.task( 'concatcss', [ 'cssmin' ], function () {

    if ( debug ) {
        console.log( "Task concatcss: env = " + env );
    }

    return gulp.src( 'assets/dest/css/*.css' )
        .pipe( concat( 'all.css' ) )
        .pipe( gulp.dest( 'assets/dest/css/' ) );
} );

// # Convert markdown to html
gulp.task( 'mk', [ 'clean' ], function () {
    return gulp.src( 'README.md' )
        .pipe( markdown() )
        .pipe( gulp.dest( 'docs/' ) );
} );

// # Rsyncing to remote storage disk
gulp.task( 'sync', [ 'compile' ], function () {

    var file = fs.readFileSync( 'rsync-excludelist', "utf8" );
    var arr = file.split( "\n" );

    if ( debug ) {
        console.log( "Task sync: exclude arr = " + arr );
        console.log( path );
    }

    return gulp.src( process.cwd() )
        .pipe( gulpif( nodry, rsync( {
            recursive: true,
            destination: path,
            progress: false,
            incremental: true,
            exclude: arr
        } ) ) );
} );

// # Check server via probe
gulp.task( 'probe', [ 'sync' ], function () {

    if ( debug ) {
        console.log( "Task probe: env = " + env );
    }

    exec( 'wget -O- http://localhost/ge-remote-production/probe &> /dev/null', function ( err, stdout, stderr ) {
        console.log( stderr );
        console.log( stdout );
    } );
} );

// # Last deployment username
gulp.task( 'deadmanwalking', ['probe'], function( cb ) {

    if ( debug ) {
        console.log( "Prisoner in green mile" );
    }

    // # Get current user
    exec( 'whoami > deadmanwalking', function ( err, stdout, stderr ) {
        cb( err );
    });
});

// # Define tasks
gulp.task( 'check', [ 'config' ] );
// # Note: git-pull depends on git-clean, git-reset ... so that we can only define it and all the dependencies
// # will be executed before, this is the same as gulp.task( 'git', [ 'git-clean', 'git... , git-pull' ] ); 
gulp.task( 'git', [ 'git-pull' ] ); 
gulp.task( 'compile', [ 'check', 'git', 'clean', 'htmlhint', 'sass', 'cssmin', 'concatcss', 'jsmin', 'mk' ] );
gulp.task( 'deploy', [ 'compile', 'sync', 'probe', 'deadmanwalking' ] );