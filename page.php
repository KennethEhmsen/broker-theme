<?php get_header(); ?>

<h1><?php the_title() ?></h1>

<div class="content">
	<?php the_post() ?>
	<?php the_content() ?>
</div>

<?php get_footer() ?>
