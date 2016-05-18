var site    = require('./site.json');
site.builtAt   = new Date();

(function() {
  var gulp    = require('gulp');
  var plugins = require('gulp-load-plugins')();
  var merge   = require('merge-stream');
  var del     = require('del');
  var open    = require('open');
  var path    = require('path');
  var os      = require('os');
  var through = require('through2');
  var fs      = require('fs');
  var forever = require('forever-monitor');
  var bSync   = require('browser-sync');
  var reload  = bSync.reload;

  var settings = {
    url: 'https://devschool.rocks',
    src: path.join('dist', '/**/*'),
    ghPages: {
      cacheDir: path.join(os.tmpdir(), 'devschool-web')
    }
  };

  var onError = function(err) {
    plugins.util.beep();
    console.log(err);
  };

  var permalink = function(path) {
    return path.split("/blog")[1].replace('.html','');
  };

  var collectReviews = function() {
    var reviews = [];

    return through.obj(function(file, enc, next) {
      var review    = file.page;
      review.body   = file.contents.toString();
      reviews.push(review);
      next();
    }, function(done) {
      site.reviews = reviews;
      done();
    });
  };

  var collectPosts = function() {
    var posts = [];

    return through.obj(function(file, enc, next) {
      var post          = file.page;
      post.body         = file.contents.toString();
      post.summary      = summarize(file.contents.toString(), '<!--more-->');
      post.permalink    = permalink(file.path);

      posts.push(post);
      this.push(file);
      next();
    }, function(done) {
      posts.sort(function(a, b) {
        return Date.parse(b.publishedOn) - Date.parse(a.publishedOn);
      });

      site.posts = posts;
      done();
    });
  };

  var summarize = function(contents, marker) {
    if (contents.indexOf(marker) !== -1) {
      var summary = contents.split(marker)[0];
      if (summary) {
        return summary;
      }
    }
  };

  gulp.task('revision', function(){
    return gulp.src(['dist/**/*.css', 'dist/**/*.js', 'dist/**/*.png', 'dist/**/*.jpg'])
               .pipe(plugins.plumber({errorHandler: onError}))
               .pipe(plugins.rev())
               .pipe(gulp.dest('dist'))
               .pipe(plugins.rev.manifest())
               .pipe(gulp.dest('dist'));
  });

  gulp.task('revreplace', ['revision'], function(){
    var manifest = gulp.src('./dist/rev-manifest.json');

    return gulp.src('./dist/**/*.html')
               .pipe(plugins.plumber({errorHandler: onError}))
               .pipe(plugins.revReplace({manifest: manifest}))
               .pipe(gulp.dest('dist'));
  });

  gulp.task('sitemap', function() {
      gulp.src(['dist/**/*.html', '!./dist/privacy/*.html', '!./dist/terms/*.html'])
          .pipe(plugins.plumber({errorHandler: onError}))
	  .pipe(plugins.sitemap({
	      siteUrl: 'https://devschool.rocks'
	  }))
	  .pipe(gulp.dest('./dist'));
  });

  // JS
  gulp.task('js', function() {
    return gulp.src(['src/js/**/*.js'])
               .pipe(plugins.plumber({errorHandler: onError}))
//               .pipe(plugins.sourcemaps.init())
               .pipe(plugins.concat('app.min.js'))
               .pipe(plugins.uglify())
//               .pipe(plugins.sourcemaps.write())
               .pipe(gulp.dest('dist/js'))
               .pipe(reload({stream: true}));
  });

  // IMAGES
  gulp.task('images', function() {
  gulp.src('src/images/**/*')
      .pipe(plugins.plumber({errorHandler: onError}))
      .pipe(plugins.imagemin())
      .pipe(gulp.dest('dist/images'));
  });

  // SCSS
  gulp.task('css', function () {
    return gulp.src(['src/sass/**/*.scss'])
               .pipe(plugins.plumber({errorHandler: onError}))
//               .pipe(plugins.sourcemaps.init())
               .pipe(plugins.autoprefixer())
               .pipe(plugins.concat('app.min.css'))
               .pipe(plugins.sass({outputStyle: 'normal', errLogToConsole: true}))
               .pipe(plugins.replace('/*!', '/*'))
               .pipe(plugins.cleanCss({keepSpecialComments: true}))
               .on('error', plugins.util.log)
//               .pipe(plugins.sourcemaps.write())
               .pipe(gulp.dest('dist/css'))
               .pipe(reload({stream: true}));
  });

  var buildPage = function(stream) {
    return stream
      .pipe(plugins.plumber({errorHandler: onError}))
      .pipe(plugins.data({site: site}))
      .pipe(plugins.nunjucksRender({
        path: ['src/templates']
      }))
      .pipe(plugins.htmlmin({collapseWhitespace: true}));
  };

  // HTML
  gulp.task('pages', ['blog'], function() {

    var pages = buildPage(
      gulp.src(['src/pages/**/*.html', '!src/pages/404.html'])
    ).pipe(plugins.indexify());

    var fourOhFour = buildPage(
      gulp.src(['src/pages/404.html'])
    );

    return merge(pages, fourOhFour)
            .pipe(gulp.dest('dist'))
            .pipe(reload({stream: true}));

  });

  // Markdown
  gulp.task('blog', ['reviews'], function(cb) {
    var stream = gulp.src(['src/blog/**/*.md'])
                     .pipe(plugins.plumber({errorHandler: onError}))
                     .pipe(plugins.frontMatter({property: 'page', remove: true}))
                     .pipe(plugins.data({site: site}))
                     .pipe(plugins.markdown())
                     .pipe(collectPosts())
                     .pipe(plugins.wrap(function (data) {
                       return fs.readFileSync('src/templates/blog.html').toString();
                     }, null, {engine: 'nunjucks'}))
                     .pipe(plugins.indexify())
                     .pipe(gulp.dest('dist'))
                     .pipe(reload({stream: true}));
    return stream;
  });

  // BOWER
  gulp.task('bower', function() {
    return plugins.bower().pipe(gulp.dest('bower_components'));
  });

  // REVIEWS
  gulp.task('reviews', function() {
    return gulp.src(['src/reviews/*.md'])
               .pipe(plugins.plumber({errorHandler: onError}))
               .pipe(plugins.frontMatter({property: 'page', remove: true}))
               .pipe(collectReviews())
               .pipe(reload({stream: true}));
  });

  gulp.task('fonts', function() {
    return gulp.src(['bower_components/font-awesome/fonts/**.*', 'src/fonts/**/*'])
               .pipe(gulp.dest('./dist/fonts'));
  });

  gulp.task('static', ['images', 'js', 'css', 'pages', 'fonts'], function() {
    return gulp.src('src/static/**/*')
               .pipe(gulp.dest('dist'));
  });

  gulp.task('clean', function(cb) {
    del('dist').then(function(paths) {
      cb();
    });
  });

  gulp.task('production', function(cb) {
    plugins.sequence('clean', 'reviews', ['static', 'bower', 'fonts'], 'sitemap', 'revreplace', cb);
  });

  gulp.task('serve', function(cb) {
    plugins.sequence('sync', 'watch', cb);
  });

  gulp.task('deploy', ['production'], function() {
    return gulp.src('dist/**/*')
               .pipe(plugins.ghPages(settings.ghPages))
               .on('end', function(){
                 open(settings.url);
               });
  });

  // BROWSER SYNC
  gulp.task('sync', function() {
    return bSync({server: { baseDir: 'dist' }});
  });

  // WATCH
  gulp.task('watch', function() {
    gulp.watch('src/js/**/*.js', ['js']);
    gulp.watch('src/sass/**/*.scss', ['css']);
    gulp.watch(['src/**/*.html'], ['pages']);
    gulp.watch(['src/blog/**/*'], ['blog']);
    gulp.watch(['src/reviews/*'], ['reviews']);
    gulp.watch('src/images/**/*', ['images']);
  });

  gulp.task('default', plugins.sequence('clean', 'reviews', ['static', 'bower', 'fonts'], 'sitemap', 'serve'));
}());
