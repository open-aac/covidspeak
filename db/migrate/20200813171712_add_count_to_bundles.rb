class AddCountToBundles < ActiveRecord::Migration[5.2]
  def change
    add_column :bundles, :uses, :integer
    add_column :bundles, :approved, :boolean
    add_index :bundles, [:approved]
  end
end
